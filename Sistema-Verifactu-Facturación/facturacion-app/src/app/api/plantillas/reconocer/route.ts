/**
 * RECONOCIMIENTO DE CAMPOS CON IA
 *
 * Recibe los recuadros que el detector no supo identificar y le pregunta a
 * Gemini qué es cada uno. Devuelve sugerencias; quien decide qué hacer con
 * ellas es `fusionarSugerencias`, y la última palabra la tiene el usuario en
 * el revisor.
 *
 * Vive en el servidor por una razón concreta: la clave del modelo no puede
 * llegar al navegador. Una clave en el bundle del cliente es una clave
 * pública, y la factura la pagamos nosotros.
 *
 * Qué modelo contesta lo decide `lib/ia/cliente.ts`: puede ser uno local o
 * uno de pago, y esta ruta no se entera.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, clientIpFromRequest } from '@/lib/rateLimit';
import { configuracionIA, FalloIA, generarTexto, respuestaDeFallo } from '@/lib/ia/cliente';
import { normalizarSugerencias } from '@/lib/ia/sugerencias';

interface Caja {
  id: string;
  texto: string;
  x: number;
  y: number;
  ancho: number;
  alto: number;
  cerca?: string;
}

interface Peticion {
  ancho: number;
  alto: number;
  cajas: Caja[];
  rotulos: string[];
  clavesDisponibles: string[];
}

/** Tope de recuadros por llamada: una factura normal no llega a treinta. */
const MAXIMO_CAJAS = 80;

function instrucciones(peticion: Peticion): string {
  return [
    'Eres un experto en facturas y albaranes españoles.',
    '',
    'Te doy los recuadros de una factura de MUESTRA que un cliente ha subido',
    'para usarla como plantilla. Cada recuadro contiene el dato que traía la',
    'muestra. Tu tarea es decir QUÉ CLASE DE DATO va en cada recuadro, para',
    'que al emitir facturas nuevas se rellene con el dato equivalente.',
    '',
    'Reglas:',
    '- Responde SÓLO con una clave de la lista de claves disponibles.',
    '- Si no estás razonablemente seguro, responde null. Es mucho mejor dejar',
    '  un recuadro sin asignar que asignarlo mal: un campo equivocado imprime',
    '  el NIF de un cliente donde va el total.',
    '- No repitas una clave en dos recuadros distintos.',
    '- Fíjate en el texto de al lado (campo "cerca"): es el rótulo impreso del',
    '  impreso y suele decir exactamente qué va en la casilla.',
    '- Las coordenadas están en milímetros, con el origen arriba a la',
    `  izquierda. La hoja mide ${peticion.ancho} x ${peticion.alto} mm.`,
    '- El motivo, en español y en menos de diez palabras.',
    '',
    'Rótulos impresos de este documento (contexto):',
    peticion.rotulos.join(' · '),
    '',
    'Claves disponibles:',
    peticion.clavesDisponibles.join(', '),
    '',
    'Recuadros sin identificar:',
    JSON.stringify(peticion.cajas),
    '',
    // EL FORMATO, DICHO CON PALABRAS Y AL FINAL
    //
    // Esto sólo iba en el `responseSchema` que se le manda a Gemini, que
    // lo cumple al pie de la letra. Un servidor local no siempre sabe
    // imponer un esquema, y sin esta parte Qwen 3 4B contestaba con un
    // mapa plano —{"c1":"doc_numero","c2":"cliente_nombre"}— en vez de la
    // lista. La información era correcta; la forma, otra.
    'FORMATO DE LA RESPUESTA. Devuelve SÓLO este objeto JSON, sin texto',
    'alrededor y sin bloque de código. La única clave de primer nivel es',
    '"sugerencias", y su valor es una LISTA con un objeto por recuadro:',
    '{"sugerencias":[{"id":"<id del recuadro>","clave":"<clave o null>","motivo":"<menos de 10 palabras>"}]}',
    'Un objeto por CADA recuadro de arriba, repitiendo su mismo "id".',
  ].join('\n');
}

// El esquema de respuesta que se le mandaba a Gemini vivía aquí. Ya no
// hay proveedor que sepa imponer uno, así que la forma se pide con
// palabras al final del enunciado y se ordena después con
// `normalizarSugerencias`, que admite las tres formas en que contestan
// los modelos y filtra siempre contra las claves permitidas.

export async function POST(request: NextRequest) {
  if (!configuracionIA()) {
    return NextResponse.json(
      { error: 'El reconocimiento con IA no está configurado en este servidor.' },
      { status: 501 },
    );
  }

  // Cada llamada cuesta dinero, o tiempo de máquina si el modelo es local:
  // un tope por IP evita que un bucle en el navegador se lo coma todo.
  const permitido = await checkRateLimit(`plantillas-ia:${clientIpFromRequest(request)}`, 30, 3600);
  if (!permitido) {
    return NextResponse.json(
      { error: 'Has hecho muchas peticiones seguidas. Espera un momento y vuelve a intentarlo.' },
      { status: 429 },
    );
  }

  let peticion: Peticion;
  try {
    peticion = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  if (!Array.isArray(peticion?.cajas) || !Array.isArray(peticion?.clavesDisponibles)) {
    return NextResponse.json({ error: 'Faltan datos de la plantilla' }, { status: 400 });
  }
  if (peticion.cajas.length === 0) {
    return NextResponse.json({ sugerencias: [] });
  }
  peticion.cajas = peticion.cajas.slice(0, MAXIMO_CAJAS);

  let texto: string;
  try {
    texto = await generarTexto({
      instrucciones: instrucciones(peticion),
      // Sin creatividad: se trata de clasificar, y queremos que la misma
      // factura dé el mismo resultado dos veces seguidas.
      temperatura: 0,
      maximoTokens: 2048,
      json: true,
      // Más holgado que la ayuda del mostrador: aquí nadie espera de pie
      // con un cliente delante, y son ochenta recuadros de una vez.
      tiempoLimiteMs: 90_000,
    });
  } catch (err) {
    if (!(err instanceof FalloIA)) throw err;
    // El detalle del proveedor no se le enseña al usuario: puede llevar
    // trazas de la petición. Al registro sí, para poder diagnosticar.
    console.error('[plantillas/reconocer] fallo de IA:', err.motivo, err.detalle ?? '');
    const { estado, error } = respuestaDeFallo(err, 'La plantilla sigue funcionando sin él.');
    return NextResponse.json({ error }, { status: estado });
  }

  try {
    // Se filtra SIEMPRE por las claves que la plantilla admite de verdad:
    // el modelo se inventa claves de vez en cuando, y una clave inventada
    // acaba imprimiendo el NIF de un cliente donde va el total. Con un
    // modelo local pasa más, no menos: el esquema que Gemini cumple al
    // pie de la letra, un servidor local puede ignorarlo.
    const validas = normalizarSugerencias(
      JSON.parse(texto),
      new Set(peticion.clavesDisponibles),
    );
    return NextResponse.json({ sugerencias: validas });
  } catch {
    console.error('[plantillas/reconocer] respuesta ilegible:', texto.slice(0, 300));
    return NextResponse.json(
      { error: 'La respuesta del servicio de IA no se ha podido interpretar.' },
      { status: 502 },
    );
  }
}

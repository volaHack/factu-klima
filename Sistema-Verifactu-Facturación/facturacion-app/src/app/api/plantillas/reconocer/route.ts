/**
 * RECONOCIMIENTO DE CAMPOS CON IA
 *
 * Recibe los recuadros que el detector no supo identificar y le pregunta a
 * Gemini qué es cada uno. Devuelve sugerencias; quien decide qué hacer con
 * ellas es `fusionarSugerencias`, y la última palabra la tiene el usuario en
 * el revisor.
 *
 * Vive en el servidor por una razón concreta: la clave de Gemini no puede
 * llegar al navegador. Una clave en el bundle del cliente es una clave
 * pública, y la factura la pagamos nosotros.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, clientIpFromRequest } from '@/lib/rateLimit';

/** Modelo pequeño y rápido: esto es clasificar etiquetas, no redactar. */
const MODELO = 'gemini-3.6-flash';
const URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

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
  ].join('\n');
}

const ESQUEMA_RESPUESTA = {
  type: 'object',
  properties: {
    sugerencias: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          clave: { type: 'string', nullable: true },
          motivo: { type: 'string' },
        },
        required: ['id', 'clave', 'motivo'],
      },
    },
  },
  required: ['sugerencias'],
};

export async function POST(request: NextRequest) {
  const clave = process.env.GEMINI_API_KEY;
  if (!clave) {
    return NextResponse.json(
      { error: 'El reconocimiento con IA no está configurado en este servidor.' },
      { status: 501 },
    );
  }

  // Cada llamada cuesta dinero: un tope por IP evita que un bucle en el
  // navegador se coma la cuota de la cuenta.
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

  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_BASE}/${MODELO}:generateContent?key=${clave}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: instrucciones(peticion) }] }],
        generationConfig: {
          // Sin creatividad: se trata de clasificar, y queremos que la misma
          // factura dé el mismo resultado dos veces seguidas.
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: ESQUEMA_RESPUESTA,
        },
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    return NextResponse.json(
      { error: 'No se ha podido contactar con el servicio de IA. La plantilla sigue funcionando sin él.' },
      { status: 502 },
    );
  }

  if (!respuesta.ok) {
    // El detalle del proveedor no se le enseña al usuario: puede llevar
    // trazas de la petición. Al registro sí, para poder diagnosticar.
    console.error('[plantillas/reconocer] Gemini respondió', respuesta.status, await respuesta.text().catch(() => ''));
    return NextResponse.json(
      { error: 'El servicio de IA no ha podido analizar la plantilla. Inténtalo de nuevo más tarde.' },
      { status: 502 },
    );
  }

  try {
    const cuerpo = await respuesta.json();
    const texto = cuerpo?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p?.text ?? '')
      .join('') ?? '';
    const analisis = JSON.parse(texto);
    const sugerencias = Array.isArray(analisis?.sugerencias) ? analisis.sugerencias : [];

    // Se filtra aquí también, y no sólo al fusionar: el modelo se inventa
    // claves de vez en cuando y no tiene sentido pasearlas por el cliente.
    const permitidas = new Set(peticion.clavesDisponibles);
    const validas = sugerencias
      .filter((s: { id?: unknown; clave?: unknown }) =>
        typeof s?.id === 'string' && (s.clave === null || (typeof s.clave === 'string' && permitidas.has(s.clave))))
      .map((s: { id: string; clave: string | null; motivo?: unknown }) => ({
        id: s.id,
        clave: s.clave,
        motivo: typeof s.motivo === 'string' ? s.motivo.slice(0, 120) : '',
      }));

    return NextResponse.json({ sugerencias: validas });
  } catch {
    return NextResponse.json(
      { error: 'La respuesta del servicio de IA no se ha podido interpretar.' },
      { status: 502 },
    );
  }
}

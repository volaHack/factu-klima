/**
 * UNA FACTURA HECHA DESDE CERO TIENE QUE SALIR VÁLIDA
 *
 * Esto no se puede comprobar mirando la pantalla: una factura a la que le
 * falte el NIF, la fecha o el desglose de impuestos es una factura que
 * Hacienda no admite, y eso no se ve hasta que alguien la manda.
 *
 * Así que se compila la plantilla, se imprime una factura de verdad y se lee
 * el PDF resultante para comprobar que dentro está todo lo que la ley pide.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { construirDatos, facturaDeMuestra } from './datos';
import { facturaDesdeCero, OFICIOS, oficioPorId } from './desdeCero';
import { generarPdf } from './generar';
import { compilarPlantilla } from './plantilla';
import type { CompanySettings } from '../types';

const AJUSTES = {
  businessName: 'Mi Empresa S.L.',
  tradeName: 'Mi Empresa',
  nif: 'B12345678',
  address: 'Calle Mayor 1',
  city: 'Madrid',
  postalCode: '28001',
  province: 'Madrid',
  phone: '600 000 000',
  email: 'hola@miempresa.es',
} as unknown as CompanySettings;

const FONDO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

beforeAll(() => {
  // El generador pide las tipografías por HTTP como en el navegador; aquí se
  // sirven desde `public/`.
  globalThis.fetch = (async (entrada: RequestInfo | URL) => {
    const archivo = readFileSync(join(process.cwd(), 'public', String(entrada).replace(/^\//, '')));
    return new Response(new Uint8Array(archivo), { status: 200 });
  }) as typeof fetch;
});

const compilar = (oficio = 'generico') =>
  compilarPlantilla(facturaDesdeCero(oficio, AJUSTES), { fondo: FONDO, archivoOrigen: '' });

async function textoDelPdf(bytes: Uint8Array): Promise<string> {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false,
  }).promise;
  let texto = '';
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    texto += (await pagina.getTextContent()).items.map((i: { str?: string }) => i.str ?? '').join(' ');
  }
  return texto;
}

describe('lo que trae puesto una factura nueva', () => {
  it('lleva todo lo que la ley obliga a poner', () => {
    // Sin esto no es una factura: es un papel con números. Y quien empieza
    // desde cero no tiene por qué saberse el reglamento de facturación.
    const claves = new Set(facturaDesdeCero('generico').campos.map(c => c.clave));
    for (const obligatorio of [
      'empresa_nombre', 'empresa_nif', 'empresa_direccion',
      'cliente_nombre', 'cliente_nif',
      'doc_numero', 'doc_fecha',
      'total_base', 'total_impuestos', 'total_general',
    ]) {
      expect(claves, `falta ${obligatorio}`).toContain(obligatorio);
    }
  });

  it('trae la tabla de líneas y el cuadro de desglose', () => {
    const analisis = facturaDesdeCero('generico');
    expect(analisis.tabla).not.toBeNull();
    expect(analisis.rejillas).toHaveLength(1);
  });

  it('el cuadro de desglose se pinta su propio marco', () => {
    // Sobre papel en blanco no hay ningún recuadro impreso debajo: si la
    // rejilla no se lo dibuja, las cifras salen flotando sin cuadro.
    const rejilla = facturaDesdeCero('generico').rejillas[0];
    expect(rejilla.contorno.marco).toBe(true);
    expect(rejilla.contorno.renglones).toBe(true);
    expect(rejilla.contorno.columnas).toBe(true);
    // Y con sus títulos: sin ellos el cuadro sale con las cifras y sin decir
    // cuál es la base y cuál la cuota.
    expect(rejilla.cabecera).toBe(true);
  });

  it('no arrastra nada que haya que borrar', () => {
    // El papel está en blanco: no hay datos de muestra de nadie. Es la
    // diferencia con subir un PDF, donde lo primero es tapar lo ajeno.
    const analisis = facturaDesdeCero('generico');
    expect(analisis.rejillas[0].celdasMuestra).toHaveLength(0);
    expect(analisis.campos.filter(c => c.valorOriginal && !c.fijo).every(c => c.clave !== null)).toBe(true);
  });

  it('arranca con los datos de la empresa, no con los de un ejemplo', () => {
    const campos = facturaDesdeCero('generico', AJUSTES).campos;
    expect(campos.find(c => c.clave === 'empresa_nif')?.valorOriginal).toBe('B12345678');
  });

  it('nada se sale de la hoja', () => {
    // Un campo que empiece fuera del A4 no se imprime y nadie se entera hasta
    // que falta un dato en la factura mandada.
    for (const campo of facturaDesdeCero('taller').campos) {
      expect(campo.x).toBeGreaterThanOrEqual(0);
      expect(campo.y).toBeGreaterThanOrEqual(0);
      expect(campo.x + campo.ancho).toBeLessThanOrEqual(210);
      expect(campo.y + campo.alto).toBeLessThanOrEqual(297);
    }
  });

  it('la tabla no pisa los totales', () => {
    // Si el hueco de la tabla llegara hasta el pie, una factura con muchas
    // líneas escribiría encima del cuadro de totales.
    const analisis = facturaDesdeCero('generico');
    const tabla = analisis.tabla!;
    const totales = analisis.campos.find(c => c.clave === 'total_general')!;
    expect(tabla.y + tabla.altoTotal).toBeLessThan(totales.y);
  });
});

describe('cada oficio trae lo suyo', () => {
  it('el taller pregunta por la matrícula y el bastidor', () => {
    const rotulos = facturaDesdeCero('taller').campos.map(c => c.texto ?? '');
    expect(rotulos).toContain('Matrícula:');
    expect(rotulos).toContain('Nº de bastidor:');
  });

  it('el fisioterapeuta avisa de que su servicio está exento de IVA', () => {
    // La asistencia sanitaria a personas físicas está exenta. Una factura de
    // fisioterapia con el 21% puesto es una factura mal hecha, y el que la
    // emite normalmente no lo sabe.
    const rotulos = facturaDesdeCero('fisio').campos.map(c => c.texto ?? '').join(' ');
    expect(rotulos).toContain('exento de IVA');
    expect(rotulos).toContain('Nº de colegiado:');
  });

  it('el abogado tiene su casilla de retención', () => {
    const rotulos = facturaDesdeCero('abogado').campos.map(c => c.texto ?? '');
    expect(rotulos).toContain('Retención IRPF:');
  });

  it('las columnas del oficio entran en la tabla', () => {
    const tabla = facturaDesdeCero('reformas').tabla!;
    expect(tabla.columnas.map(c => c.cabecera)).toContain('m²');
    expect(tabla.columnas.map(c => c.cabecera)).toContain('Partida');
  });

  it('ningún oficio se pasa del ancho de la hoja', () => {
    // Con cuatro columnas propias, la de concepto se queda sin sitio y la
    // tabla se sale por la derecha.
    for (const oficio of OFICIOS) {
      const tabla = facturaDesdeCero(oficio.id).tabla!;
      const ancho = tabla.columnas.reduce((suma, c) => suma + c.ancho, 0);
      expect(ancho, `${oficio.nombre} se sale`).toBeLessThanOrEqual(tabla.ancho + 0.5);
      expect(tabla.columnas[0].ancho, `${oficio.nombre} sin sitio para el concepto`).toBeGreaterThan(30);
    }
  });

  it('un oficio que no existe cae en el genérico en vez de reventar', () => {
    expect(oficioPorId('lo-que-sea').id).toBe('generico');
  });
});

describe('de punta a punta: imprimir una factura hecha desde cero', () => {
  it('sale un PDF con los datos de la factura dentro', async () => {
    const { plantilla } = compilar();
    const datos = construirDatos({ tipo: 'factura', documento: facturaDeMuestra() }, AJUSTES);
    const texto = await textoDelPdf(await generarPdf(plantilla, datos));

    expect(texto).toContain('B12345678');
    expect(texto).toContain(datos.campos.doc_numero);
    expect(texto.replace(/\s/g, '')).toContain(datos.campos.total_general.replace(/[^\d,.]/g, ''));
  }, 60_000);

  it('el desglose de impuestos sale impreso', async () => {
    // Es obligatorio en toda factura con IVA, y sobre papel en blanco depende
    // por completo de que la rejilla se materialice y se dibuje sola.
    const { plantilla } = compilar();
    const datos = construirDatos({ tipo: 'factura', documento: facturaDeMuestra() }, AJUSTES);
    const texto = await textoDelPdf(await generarPdf(plantilla, datos));

    const base = datos.impuestos[0].base.replace(/[^\d.,]/g, '');
    expect(texto.replace(/\s/g, '')).toContain(base.replace(/\s/g, ''));
  }, 60_000);
});

describe('nada se pisa con nada', () => {
  it('los rótulos del oficio no llegan a la tabla', () => {
    // El taller lleva cuatro —matrícula, marca, kilometraje y bastidor— y el
    // último queda a dos milímetros de la cabecera de la tabla. Un oficio con
    // uno más se metería dentro, y en el PDF saldrían las dos cosas
    // superpuestas sin que nadie lo viera hasta mandarlo.
    for (const oficio of OFICIOS) {
      const analisis = facturaDesdeCero(oficio.id);
      const rotulos = analisis.campos.filter(c => c.fijo && c.y > 80 && c.y < 108);
      const tabla = analisis.tabla!;
      for (const rotulo of rotulos) {
        expect(rotulo.y + rotulo.alto, `${oficio.nombre}: «${rotulo.texto}» toca la tabla`)
          .toBeLessThan(tabla.y);
      }
    }
  });

  it('el cuadro de desglose no se mete en los totales', () => {
    // Van enfrentados, el desglose a la izquierda y los totales a la derecha.
    // Si el desglose creciera de ancho se comería las cifras del total.
    const analisis = facturaDesdeCero('generico');
    const rejilla = analisis.rejillas[0];
    const totales = analisis.campos.filter(c => c.clave?.startsWith('total_'));
    for (const total of totales) {
      expect(total.x).toBeGreaterThanOrEqual(rejilla.x + rejilla.ancho);
    }
  });

  it('el desglose cabe entre su rótulo y el pie de pago', () => {
    const analisis = facturaDesdeCero('generico');
    const rejilla = analisis.rejillas[0];
    const pie = analisis.campos.filter(c => c.y > 230).map(c => c.y);
    expect(rejilla.y + rejilla.alto).toBeLessThan(Math.min(...pie));
  });
});

describe('la vista previa de una factura desde cero', () => {
  it('la página que se le entrega al editor no vale tal cual', () => {
    // El fallo que esto vigila: la sesión se montaba a mano metiendo la página
    // pelada donde se espera una CON LIENZO, forzándolo con un `as`. Al pedir
    // la vista previa, compilar iba a leer los píxeles del calco y reventaba
    // con «Cannot read properties of undefined (reading 'width')».
    //
    // La página de una factura nueva no trae lienzo ni píxeles —no ha pasado
    // por ningún navegador todavía—, así que hay que rehidratarla antes, que
    // es lo que hace `sesionDesdeCero`.
    const pagina = facturaDesdeCero('generico').pagina as unknown as Record<string, unknown>;
    expect(pagina.lienzo).toBeUndefined();
    expect(pagina.pixeles).toBeUndefined();
    // Y trae el mapa de bits del que rehidratarla.
    expect(String(pagina.bitmap && (pagina.bitmap as { dataUrl: string }).dataUrl))
      .toMatch(/^data:image\/png;base64,/);
  });

  it('el papel tiene el tamaño del A4 que dice ser', () => {
    // Si el mapa de bits no cuadrara con los milímetros de la página, todo lo
    // que se coloque encima saldría desplazado al imprimir.
    const pagina = facturaDesdeCero('generico').pagina;
    expect(pagina.ancho).toBe(210);
    expect(pagina.alto).toBe(297);
    expect(pagina.bitmap.anchoPx / pagina.bitmap.pxPorMm).toBeCloseTo(210, 0);
    expect(pagina.bitmap.altoPx / pagina.bitmap.pxPorMm).toBeCloseTo(297, 0);
  });
});

describe('la asignación llega con datos, no con cajas vacías', () => {
  it('cada campo asignado arranca con un ejemplo de su dato', () => {
    // Una factura entera de recuadros vacíos no se puede revisar: no hay
    // manera de ver si el nombre del cliente cabe donde está puesto, ni si el
    // total se sale de su sitio, hasta emitir la primera de verdad.
    const campos = facturaDesdeCero('generico').campos.filter(c => c.clave && !c.fijo);
    const conValor = campos.filter(c => c.valorOriginal.trim().length > 0);
    expect(conValor.length / campos.length).toBeGreaterThan(0.7);
  });

  it('los datos de la empresa mandan sobre el ejemplo', () => {
    // Si el ejemplo pisara los ajustes, el editor enseñaría el NIF de un
    // inventado en lugar del de quien está haciendo la factura.
    const campos = facturaDesdeCero('taller', AJUSTES).campos;
    expect(campos.find(c => c.clave === 'empresa_nif')?.valorOriginal).toBe('B12345678');
  });

  it('el ejemplo no se cuela en el PDF impreso', async () => {
    // Es sólo para ver la plantilla en el editor. Si se imprimiera, cada
    // factura saldría con el nombre del cliente de mentira.
    const { plantilla } = compilar();
    const datos = construirDatos({ tipo: 'factura', documento: facturaDeMuestra() }, AJUSTES);
    const texto = await textoDelPdf(await generarPdf(plantilla, datos));
    const ejemplo = facturaDesdeCero('generico').campos
      .find(c => c.clave === 'cliente_nombre')?.valorOriginal ?? '';
    if (ejemplo) expect(texto).not.toContain(ejemplo);
  }, 60_000);
});

describe('los descuentos llegan a la factura impresa', () => {
  const conDescuentos = () => {
    const factura = facturaDeMuestra();
    // Tres en cascada sobre la primera línea: 10 y 10 y 5.
    factura.lineItems[0] = {
      ...factura.lineItems[0],
      discountPercent: 10, discountPercent2: 10, discountPercent3: 5,
    };
    return factura;
  };

  it('la casilla de descuento lleva el efectivo, no el primero de los tres', () => {
    // El fallo: se mandaba `linea.discountPercent` a secas, así que la
    // factura decía «10%» donde se había hecho un 23,05% y el importe de al
    // lado no cuadraba con el porcentaje impreso.
    const datos = construirDatos({ tipo: 'factura', documento: conDescuentos() }, AJUSTES);
    expect(datos.lineas[0].descuento_pct).toContain('23,05');
  });

  it('y por separado, para quien los quiera desglosados', () => {
    const datos = construirDatos({ tipo: 'factura', documento: conDescuentos() }, AJUSTES);
    expect(datos.lineas[0].descuento_1_pct).toContain('10');
    expect(datos.lineas[0].descuento_2_pct).toContain('10');
    expect(datos.lineas[0].descuento_3_pct).toContain('5');
  });

  it('sin descuento no ensucia la casilla', () => {
    const datos = construirDatos({ tipo: 'factura', documento: facturaDeMuestra() }, AJUSTES);
    expect(datos.lineas[0].descuento_2_pct).toBe('');
  });

  it('el descuento sale impreso en el PDF', async () => {
    // De punta a punta: si la columna de descuento no está en la plantilla o
    // el dato no llega, esto lo caza.
    const analisis = facturaDesdeCero('generico', AJUSTES);
    analisis.tabla!.columnas.splice(1, 0, {
      clave: 'descuento_pct', cabecera: 'Dto.', x: 100, ancho: 18,
      alineacion: 'right', numerica: true,
    } as never);
    const { plantilla } = compilarPlantilla(analisis, { fondo: FONDO, archivoOrigen: '' });
    const datos = construirDatos({ tipo: 'factura', documento: conDescuentos() }, AJUSTES);
    const texto = await textoDelPdf(await generarPdf(plantilla, datos));
    expect(texto.replace(/\s/g, '')).toContain('23,05');
  }, 60_000);
});

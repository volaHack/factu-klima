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
import { facturaDesdeCero, OFICIOS, oficioPorId, oficioParaSector, plantillaDeOtroOficio } from './desdeCero';
import { generarPdf } from './generar';
import { compilarPlantilla } from './plantilla';
import type { CompanySettings } from '../types';
import { BUSINESS_SECTORS } from '../constants';

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

  it('trae la tabla de líneas y los dos cuadros del pie', () => {
    const analisis = facturaDesdeCero('generico');
    expect(analisis.tabla).not.toBeNull();
    // El desglose de impuestos y la relación de pagos: los dos recuadros que
    // lleva abajo cualquier factura.
    expect(analisis.rejillas.map(r => r.fuente).sort()).toEqual(['impuestos', 'vencimientos']);
  });

  it('el cuadro de desglose se pinta su propio marco', () => {
    // Sobre papel en blanco no hay ningún recuadro impreso debajo: si la
    // rejilla no se lo dibuja, las cifras salen flotando sin cuadro.
    const rejilla = facturaDesdeCero('generico').rejillas.find(r => r.fuente === 'impuestos')!;
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
    //
    // El concepto se busca por su clave y no por su posición: los oficios de
    // distribución abren la fila con la referencia del artículo, así que ya
    // no siempre es la primera columna.
    for (const oficio of OFICIOS) {
      const tabla = facturaDesdeCero(oficio.id).tabla!;
      const ancho = tabla.columnas.reduce((suma, c) => suma + c.ancho, 0);
      const concepto = tabla.columnas.find(c => c.clave === 'descripcion');
      expect(ancho, `${oficio.nombre} se sale`).toBeLessThanOrEqual(tabla.ancho + 0.5);
      expect(concepto, `${oficio.nombre} sin columna de concepto`).toBeDefined();
      expect(concepto!.ancho, `${oficio.nombre} sin sitio para el concepto`).toBeGreaterThan(30);
    }
  });

  it('un distribuidor imprime las unidades por caja, no sólo los bultos', () => {
    // El dato se metía en el formulario desde hacía tiempo, pero ningún
    // oficio de plantilla lo sacaba impreso: los treinta que había eran
    // todos de servicios.
    const tabla = facturaDesdeCero('distribucion').tabla!;
    const claves = tabla.columnas.map(c => c.clave);
    expect(claves).toContain('uds_caja');
    expect(claves).toContain('uds_linea');
    expect(claves).toContain('ref');
  });

  it('quien vende servicios no arrastra columnas de caja', () => {
    for (const id of ['psicologo', 'abogado', 'fontanero', 'generico']) {
      const claves = facturaDesdeCero(id).tabla!.columnas.map(c => c.clave);
      expect(claves, id).not.toContain('uds_caja');
      expect(claves, id).not.toContain('uds_linea');
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

describe('la relación de pagos del pie', () => {
  const conVencimiento = (extra: Record<string, unknown> = {}) => ({
    ...facturaDeMuestra(),
    issueDate: '2026-08-18',
    dueDate: '2026-09-17',
    ...extra,
  });

  it('dice cuándo, cuánto y de qué manera', () => {
    // El recuadro que casi todos los impresos traen abajo y que hasta ahora
    // se quedaba en blanco porque no había de dónde llenarlo.
    const [fila] = construirDatos({ tipo: 'factura', documento: conVencimiento() }, AJUSTES).vencimientos;
    expect(fila.venc_fecha).toContain('17');
    expect(fila.venc_importe).toContain('€');
    expect(fila.venc_forma).toBeTruthy();
  });

  it('cuenta los días de emisión a vencimiento', () => {
    // De ahí sale el «a 30 días» que va escrito en el propio recuadro.
    const [fila] = construirDatos({ tipo: 'factura', documento: conVencimiento() }, AJUSTES).vencimientos;
    expect(fila.venc_dias).toBe('30 días');
  });

  it('distingue lo cobrado de lo que sigue debiéndose', () => {
    const total = conVencimiento().total;
    const cobrada = construirDatos({ tipo: 'factura', documento: conVencimiento({ paidAmount: total }) }, AJUSTES);
    expect(cobrada.vencimientos[0].venc_estado).toBe('Cobrado');

    const aMedias = construirDatos({ tipo: 'factura', documento: conVencimiento({ paidAmount: total / 2 }) }, AJUSTES);
    expect(aMedias.vencimientos[0].venc_estado).toMatch(/^Pendiente .*€/);
  });

  it('un documento sin vencimiento no imprime renglones', () => {
    // Un presupuesto o un albarán no tienen nada que decir aquí, y un cuadro
    // lleno de guiones es peor que un cuadro vacío.
    const sin = construirDatos({ tipo: 'factura', documento: conVencimiento({ dueDate: '' }) }, AJUSTES);
    expect(sin.vencimientos).toHaveLength(0);
  });

  it('sale impreso en el PDF', async () => {
    // De punta a punta: el cuadro está en la factura desde cero, así que si
    // no llegan los datos o no se materializa, esto lo caza.
    const { plantilla } = compilarPlantilla(facturaDesdeCero('generico', AJUSTES), { fondo: FONDO, archivoOrigen: '' });
    const datos = construirDatos({ tipo: 'factura', documento: conVencimiento() }, AJUSTES);
    const texto = await textoDelPdf(await generarPdf(plantilla, datos));
    expect(texto).toContain('RELACIÓN DE PAGOS');
    expect(texto.replace(/\s/g, '')).toContain('30días');
  }, 60_000);
});

describe('las unidades por bulto en la factura impresa', () => {
  const conCajas = () => {
    const f = facturaDeMuestra();
    f.lineItems = f.lineItems.map((l, i) => ({ ...l, quantity: i === 0 ? 12 : 3, unitsPerPackage: i === 0 ? 24 : 6 }));
    return f;
  };

  it('cada línea dice su formato y a cuántas unidades sale', () => {
    const { lineas } = construirDatos({ tipo: 'factura', documento: conCajas() }, AJUSTES);
    expect(lineas[0].uds_caja).toBe('24');
    expect(lineas[0].uds_linea).toBe('288');
  });

  it('el pie suma las unidades y los bultos', () => {
    const factura = conCajas();
    const unidades = factura.lineItems.reduce((s, l) => s + l.quantity * (l.unitsPerPackage ?? 1), 0);
    const bultos = factura.lineItems.reduce((s, l) => s + l.quantity, 0);
    // Las unidades son bastantes más que los bultos: eso es justo lo que
    // distingue las dos casillas.
    expect(unidades).toBeGreaterThan(bultos);

    const { campos } = construirDatos({ tipo: 'factura', documento: factura }, AJUSTES);
    expect(campos.total_unidades).toBe(String(unidades));
    expect(campos.total_bultos).toBe(String(bultos));
  });

  it('lo que se vende suelto no ensucia la casilla de formato', () => {
    // Un «1» en la columna U/C de una factura de servicios no dice nada y
    // llena el impreso de unos.
    const { lineas } = construirDatos({ tipo: 'factura', documento: facturaDeMuestra() }, AJUSTES);
    expect(lineas[0].uds_caja).toBe('');
  });

  it('sale impreso en el PDF', async () => {
    const analisis = facturaDesdeCero('generico', AJUSTES);
    analisis.tabla!.columnas.splice(1, 0, {
      clave: 'uds_linea', cabecera: 'Udes.', x: 96, ancho: 16,
      alineacion: 'right', numerica: true,
    } as never);
    const { plantilla } = compilarPlantilla(analisis, { fondo: FONDO, archivoOrigen: '' });
    const datos = construirDatos({ tipo: 'factura', documento: conCajas() }, AJUSTES);
    const texto = await textoDelPdf(await generarPdf(plantilla, datos));
    expect(texto).toContain('288');
  }, 60_000);

  it('el oficio de distribución lo imprime sin tocar nada a mano', async () => {
    // La prueba de arriba mete la columna a mano porque el oficio genérico
    // no la trae. Ésta comprueba lo que ve de verdad un distribuidor: elige
    // su oficio, y las cajas y las unidades salen impresas solas.
    const analisis = facturaDesdeCero('distribucion', AJUSTES);
    const { plantilla } = compilarPlantilla(analisis, { fondo: FONDO, archivoOrigen: '' });
    const datos = construirDatos({ tipo: 'factura', documento: conCajas() }, AJUSTES);
    const texto = await textoDelPdf(await generarPdf(plantilla, datos));
    expect(texto).toContain('288');  // unidades de la línea
    expect(texto).toContain('24');   // unidades por caja
  }, 60_000);
});

describe('el aviso de QR que falta', () => {
  it('una factura desde cero ya trae su QR: no hay aviso que dar', () => {
    const analisis = facturaDesdeCero('generico', AJUSTES);
    const { diagnostico } = compilarPlantilla(analisis, { fondo: FONDO, archivoOrigen: '' });
    expect(diagnostico.avisos.some(a => a.texto.includes('QR de Veri*Factu'))).toBe(false);
  });

  it('una plantilla sin el campo del QR lo avisa: sin él la factura incumple', () => {
    const analisis = facturaDesdeCero('generico', AJUSTES);
    analisis.campos = analisis.campos.filter(c => c.clave !== 'verifactu_qr');
    const { diagnostico } = compilarPlantilla(analisis, { fondo: FONDO, archivoOrigen: '' });
    expect(diagnostico.avisos.some(a => a.nivel === 'aviso' && a.texto.includes('QR de Veri*Factu'))).toBe(true);
  });
});

describe('el oficio que le toca a cada sector', () => {
  it('un psicólogo no acaba con la factura de un distribuidor', () => {
    const oficio = oficioParaSector('psicologia');
    expect(oficio.id).toBe('psicologo');
    expect(oficio.unidad).toBe('Sesiones');
    expect(oficio.columnasFijas ?? []).toHaveLength(0);
  });

  it('un distribuidor sí la lleva, con sus cajas', () => {
    const oficio = oficioParaSector('alimentacion');
    expect(oficio.id).toBe('distribucion');
    expect((oficio.columnasFijas ?? []).map(c => c.clave)).toContain('uds_caja');
  });

  it('los 36 sectores tienen oficio, y existe', () => {
    // Sin esto, añadir un sector nuevo a constants.ts y olvidarse del mapa
    // le deja la factura del genérico sin que nadie se entere.
    const ids = new Set(OFICIOS.map(o => o.id));
    for (const sector of BUSINESS_SECTORS) {
      const oficio = oficioParaSector(sector.value);
      expect(ids.has(oficio.id), `${sector.value} → ${oficio.id}`).toBe(true);
    }
  });

  it('sin sector cae en el genérico en vez de reventar', () => {
    expect(oficioParaSector(undefined).id).toBe('generico');
  });

  it('quien vende trabajo no hereda columnas de mercancía', () => {
    // El fallo que se vio en pantalla: un formulario de psicología pidiendo
    // el formato de la caja. Ninguna actividad de servicios debe traer
    // columnas de bulto en su plantilla de salida.
    const servicios = BUSINESS_SECTORS.filter(s => s.grupo !== 'comercio' && s.value !== 'transporte');
    for (const sector of servicios) {
      const claves = (oficioParaSector(sector.value).columnasFijas ?? []).map(c => c.clave);
      expect(claves, sector.value).not.toContain('uds_caja');
      expect(claves, sector.value).not.toContain('uds_linea');
    }
  });
});

describe('la plantilla que es de otro gremio', () => {
  // El caso de la captura: sector «Abogacía y Despachos» con la plantilla de
  // un distribuidor, y las líneas pidiendo «CAJ.» y «U/C» en cada minuta.
  it('avisa cuando un abogado factura con la plantilla de un distribuidor', () => {
    const ajena = plantillaDeOtroOficio('distribucion', 'abogacia');
    expect(ajena?.id).toBe('distribucion');
  });

  it('no avisa cuando la plantilla es la de su sector', () => {
    expect(plantillaDeOtroOficio('abogado', 'abogacia')).toBeNull();
    expect(plantillaDeOtroOficio('psicologo', 'psicologia')).toBeNull();
    expect(plantillaDeOtroOficio('distribucion', 'alimentacion')).toBeNull();
  });

  it('la genérica vale para cualquiera y no se marca como ajena', () => {
    // Es una factura española normal y corriente: quien la elige a
    // propósito no tiene por qué ver un aviso cada vez que factura.
    expect(plantillaDeOtroOficio('generico', 'abogacia')).toBeNull();
  });

  it('sin oficio guardado o sin sector, no se inventa nada', () => {
    // Las plantillas que salieron de un PDF subido no traen oficio: ahí el
    // diseño lo pone el usuario y no hay nada que corregir.
    expect(plantillaDeOtroOficio(undefined, 'abogacia')).toBeNull();
    expect(plantillaDeOtroOficio('distribucion', undefined)).toBeNull();
  });

  it('ningún sector se avisa a sí mismo', () => {
    // Si el mapa sector→oficio y este aviso se desincronizaran, todo el
    // mundo vería el aviso siempre.
    for (const sector of BUSINESS_SECTORS) {
      const suyo = oficioParaSector(sector.value);
      expect(plantillaDeOtroOficio(suyo.id, sector.value), sector.value).toBeNull();
    }
  });
});

describe('cada sector con lo que su factura necesita', () => {
  /** Los rótulos del pie y las cabeceras de columna de un oficio, en un texto. */
  const contenidoDe = (sector: string) => {
    const oficio = oficioParaSector(sector as never);
    const analisis = facturaDesdeCero(oficio.id, AJUSTES);
    return {
      oficio,
      rotulos: analisis.campos.map(c => c.texto ?? '').join(' | '),
      columnas: analisis.tabla!.columnas.map(c => c.cabecera),
    };
  };

  it('ningún sector se queda con la factura del genérico', () => {
    // El genérico es para quien todavía no ha elegido sector, no un cajón
    // para los que se nos olvidaron. «Fotografía de eventos» caía ahí.
    for (const sector of BUSINESS_SECTORS) {
      expect(oficioParaSector(sector.value).id, sector.value).not.toBe('generico');
    }
  });

  it('el pie no se mete dentro de la tabla', () => {
    // Los rótulos del oficio se apilan desde y=88 de 4,5 mm en 4,5 mm y la
    // tabla empieza en 108: a partir del quinto se escriben encima de la
    // cabecera de las líneas. Con `taller`, `transporte` e `informatico`
    // ya en cuatro, esto es un borde real y no una hipótesis.
    for (const oficio of OFICIOS) {
      const tabla = facturaDesdeCero(oficio.id).tabla!;
      const finDelPie = 88 + (oficio.pie?.length ?? 0) * 4.5;
      expect(finDelPie, `${oficio.nombre} pisa la tabla`).toBeLessThanOrEqual(tabla.y);
    }
  });

  it('los sanitarios que la ley exime lo dicen en la factura', () => {
    // Art. 20.Uno.3º LIVA nombra a médicos, odontólogos y demás sanitarios.
    // Al dentista le faltaba: imprimía sus facturas sin el aviso.
    for (const sector of ['medicina', 'dental', 'psicologia', 'fisioterapia']) {
      expect(contenidoDe(sector).rotulos, sector).toContain('exento de IVA');
    }
  });

  it('el veterinario NO dice que esté exento, porque no lo está', () => {
    // La asistencia a animales tributa al 21%. Un aviso de exención aquí
    // sería una factura mal hecha, no un detalle de más.
    expect(contenidoDe('veterinaria').rotulos).not.toContain('exento de IVA');
  });

  it('quien practica retención de IRPF trae su casilla', () => {
    for (const sector of ['abogacia', 'asesoria', 'peritaje', 'arquitectura', 'ingenieria', 'freelance']) {
      expect(contenidoDe(sector).rotulos, sector).toContain('Retención IRPF:');
    }
  });

  it('el taller separa la mano de obra del recambio', () => {
    // Con sólo la referencia, las horas de trabajo iban sueltas dentro de la
    // descripción y no había manera de ver cuánto se cobró de mano de obra.
    const { columnas } = contenidoDe('taller');
    expect(columnas).toContain('Horas');
    expect(columnas).toContain('Referencia');
  });

  it.each([
    ['psicologia', 'Sesiones'],
    ['fisioterapia', 'Sesiones'],
    ['peritaje', 'Horas'],
    ['ingenieria', 'Horas'],
    ['informatica', 'Horas'],
    ['limpieza', 'Horas'],
    ['clases', 'Horas'],
    ['traduccion', 'Palabras'],
    ['alimentacion', 'Cajas'],
    ['mayorista', 'Cajas'],
  ])('%s mide en «%s»', (sector, unidad) => {
    expect(contenidoDe(sector).oficio.unidad).toBe(unidad);
  });

  it.each([
    ['taller', 'Matrícula:'],
    ['transporte', 'Origen:'],
    ['inmobiliaria', 'Inmueble:'],
    ['reformas', 'Nº de obra:'],
    ['fontaneria', 'Urgencia:'],
    ['electricidad', 'Nº de instalación:'],
    ['procuraduria', 'Juzgado:'],
    ['medicina', 'Centro médico:'],
    ['eventos', 'Fecha del evento:'],
    ['traduccion', 'Urgencia:'],
    ['peluqueria', 'Bono:'],
    ['clases', 'Bono:'],
  ])('%s pregunta por «%s»', (sector, rotulo) => {
    expect(contenidoDe(sector).rotulos).toContain(rotulo);
  });

  it('ninguna factura de servicios trae columna de cajas', () => {
    // El fallo que se vio en pantalla, comprobado desde el sector y no
    // desde el oficio: lo que elige el usuario es el sector.
    const conBultos = ['supermercado', 'alimentacion', 'mayorista', 'bebidas', 'servicios_industriales', 'transporte'];
    for (const sector of BUSINESS_SECTORS.filter(s => !conBultos.includes(s.value))) {
      const { columnas } = contenidoDe(sector.value);
      for (const prohibida of ['U/C', 'Udes.', 'CAJ.', 'Cajas', 'Bultos']) {
        expect(columnas, `${sector.value} trae «${prohibida}»`).not.toContain(prohibida);
      }
    }
  });
});

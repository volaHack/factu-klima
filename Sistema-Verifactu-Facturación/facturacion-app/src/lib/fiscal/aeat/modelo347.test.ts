import { describe, it, expect } from 'vitest';
import {
  UMBRAL_347,
  calcularModelo347,
  validarModelo347,
  generarFichero347,
  registroDeclarante,
  registroDeclarado,
  codigoProvincia,
  nombreFichero347,
  type DatosModelo347,
} from './modelo347';
import type { Invoice, Client, Gasto } from '../../types';

/**
 * Las posiciones que se comprueban aquí salen del diseño de registro
 * oficial de la AEAT del modelo 347, ejercicio 2025 y siguientes:
 * https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_300_399/archivos/347.pdf
 *
 * Se leen con `pos(registro, desde, hasta)` usando las posiciones TAL CUAL
 * las numera el diseño (empezando en 1, ambos extremos incluidos), para
 * que el test se pueda cotejar con el PDF sin traducir índices.
 */
function pos(registro: string, desde: number, hasta = desde): string {
  return registro.slice(desde - 1, hasta);
}

const EMPRESA = { nif: 'B12345674', businessName: 'Distribuciones Ejemplo SL' };

function factura(over: Partial<Invoice>): Invoice {
  return {
    id: 'f1',
    number: 'FAC-001',
    series: 'FAC',
    clientId: 'c1',
    clientName: 'Cliente Uno SL',
    clientNif: 'B65432106',
    clientAddress: '',
    issueDate: '2026-02-10',
    dueDate: '2026-03-10',
    status: 'emitida',
    lineItems: [],
    subtotal: 1000,
    totalDiscount: 0,
    taxBreakdown: [],
    totalTax: 70,
    total: 1070,
    paymentMethod: 'transferencia',
    notes: '',
    ...over,
  } as Invoice;
}

const CLIENTES: Client[] = [
  {
    id: 'c1',
    nif: 'B65432106',
    businessName: 'Cliente Uno SL',
    province: 'Las Palmas',
  } as Client,
];

function datos(facturas: Invoice[], gastos: Gasto[] = []): DatosModelo347 {
  return { facturas, gastos, clientes: CLIENTES };
}

describe('modelo 347 — cálculo', () => {
  it('sólo declara terceros que superan el umbral de 3.005,06 €', () => {
    const bajo = calcularModelo347(datos([factura({ total: 3000 })]), { ejercicio: 2026 });
    expect(bajo.lineas).toHaveLength(0);
    expect(bajo.descartadosPorUmbral).toBe(1);

    const alto = calcularModelo347(datos([factura({ total: 3005.07 })]), { ejercicio: 2026 });
    expect(alto.lineas).toHaveLength(1);
  });

  it('el umbral se mide sobre la suma del año, no factura a factura', () => {
    const r = calcularModelo347(
      datos([
        factura({ id: 'a', number: 'FAC-001', total: 2000, issueDate: '2026-01-15' }),
        factura({ id: 'b', number: 'FAC-002', total: 2000, issueDate: '2026-05-15' }),
      ]),
      { ejercicio: 2026 },
    );
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0].totalAnual).toBe(4000);
  });

  it('reparte por trimestre según la fecha de emisión', () => {
    const r = calcularModelo347(
      datos([
        factura({ id: 'a', total: 4000, issueDate: '2026-01-01' }),
        factura({ id: 'b', total: 1000, issueDate: '2026-04-01' }),
        factura({ id: 'c', total: 500, issueDate: '2026-09-30' }),
        factura({ id: 'd', total: 250, issueDate: '2026-12-31' }),
      ]),
      { ejercicio: 2026 },
    );
    expect(r.lineas[0].trimestres).toEqual({ 1: 4000, 2: 1000, 3: 500, 4: 250 });
    expect(r.porTrimestre).toEqual({ 1: 4000, 2: 1000, 3: 500, 4: 250 });
  });

  it('declara el TOTAL con impuesto, no la base imponible', () => {
    const r = calcularModelo347(
      datos([factura({ subtotal: 10000, totalTax: 700, total: 10700 })]),
      { ejercicio: 2026 },
    );
    expect(r.lineas[0].totalAnual).toBe(10700);
  });

  it('deja fuera anuladas, borradores, albaranes y otros ejercicios', () => {
    const r = calcularModelo347(
      datos([
        factura({ id: 'a', total: 5000, cancelledAt: '2026-03-01' }),
        factura({ id: 'b', total: 5000, status: 'borrador' as Invoice['status'] }),
        factura({ id: 'c', total: 5000, tipo: 'albaran' as Invoice['tipo'] }),
        factura({ id: 'd', total: 5000, issueDate: '2025-02-10' }),
      ]),
      { ejercicio: 2026 },
    );
    expect(r.lineas).toHaveLength(0);
  });

  it('separa ventas (clave B) de compras (clave A) del mismo NIF', () => {
    const r = calcularModelo347(
      datos([
        factura({ id: 'a', total: 5000, sentido: 'venta' as Invoice['sentido'] }),
        factura({ id: 'b', total: 4000, sentido: 'compra' as Invoice['sentido'] }),
      ]),
      { ejercicio: 2026 },
    );
    expect(r.lineas).toHaveLength(2);
    expect(r.lineas.map(l => l.clave).sort()).toEqual(['A', 'B']);
    expect(r.importeVentas).toBe(5000);
    expect(r.importeCompras).toBe(4000);
  });

  it('suma los gastos con proveedor identificado como compras', () => {
    const gasto = {
      id: 'g1',
      fecha: '2026-03-01',
      concepto: 'Alquiler nave',
      proveedorId: 'c1',
      proveedorNombre: 'Cliente Uno SL',
      total: 6000,
    } as Gasto;
    const r = calcularModelo347(datos([], [gasto]), { ejercicio: 2026 });
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0].clave).toBe('A');
    expect(r.lineas[0].totalAnual).toBe(6000);
  });

  it('ignora gastos sin proveedor identificado: no se puede declarar un NIF que no existe', () => {
    const gasto = { id: 'g1', fecha: '2026-03-01', concepto: 'Gasolina', total: 9000 } as Gasto;
    const r = calcularModelo347(datos([], [gasto]), { ejercicio: 2026 });
    expect(r.lineas).toHaveLength(0);
  });
});

describe('modelo 347 — fichero oficial', () => {
  const resultado = calcularModelo347(
    datos([
      factura({ id: 'a', total: 4000, issueDate: '2026-02-10' }),
      factura({ id: 'b', total: 1000, issueDate: '2026-07-10' }),
    ]),
    { ejercicio: 2026 },
  );

  it('todos los registros miden exactamente 500 posiciones', () => {
    const fichero = generarFichero347(resultado, EMPRESA);
    const registros = fichero.split('\r\n').filter(Boolean);
    expect(registros).toHaveLength(2); // 1 declarante + 1 declarado
    for (const r of registros) expect(r).toHaveLength(500);
  });

  it('separa los registros con CRLF, como pide el diseño', () => {
    expect(generarFichero347(resultado, EMPRESA)).toMatch(/\r\n$/);
  });

  describe('registro de tipo 1 (declarante)', () => {
    const r = registroDeclarante(resultado, EMPRESA, {
      telefono: '928123456',
      contacto: 'PEREZ GARCIA JUAN',
      numeroIdentificativo: '3470000000001',
    });

    it('posición 1: constante "1"', () => expect(pos(r, 1)).toBe('1'));
    it('posiciones 2-4: constante "347"', () => expect(pos(r, 2, 4)).toBe('347'));
    it('posiciones 5-8: ejercicio', () => expect(pos(r, 5, 8)).toBe('2026'));
    it('posiciones 9-17: NIF del declarante', () => expect(pos(r, 9, 17)).toBe('B12345674'));
    it('posiciones 18-57: razón social, a la izquierda y en mayúsculas', () => {
      expect(pos(r, 18, 57)).toBe('DISTRIBUCIONES EJEMPLO SL'.padEnd(40, ' '));
    });
    it('posición 58: tipo de soporte "T" (telemático)', () => expect(pos(r, 58)).toBe('T'));
    it('posiciones 59-67: teléfono', () => expect(pos(r, 59, 67)).toBe('928123456'));
    it('posiciones 108-120: número identificativo que empieza por 347', () => {
      expect(pos(r, 108, 120)).toBe('3470000000001');
      expect(pos(r, 108, 110)).toBe('347');
    });
    it('posiciones 121-122: en blanco si no es complementaria ni sustitutiva', () => {
      expect(pos(r, 121, 122)).toBe('  ');
    });
    it('posiciones 136-144: número total de declarados', () => {
      expect(pos(r, 136, 144)).toBe('000000001');
    });
    it('posición 145: signo del importe total (espacio si es positivo)', () => {
      expect(pos(r, 145)).toBe(' ');
    });
    it('posiciones 146-160: importe total sin coma decimal', () => {
      // 5.000,00 € → 13 dígitos de parte entera + 2 de decimales
      expect(pos(r, 146, 158)).toBe('0000000005000');
      expect(pos(r, 159, 160)).toBe('00');
    });
    it('posiciones 488-500: sello electrónico en blanco (lo rellena la AEAT)', () => {
      expect(pos(r, 488, 500)).toBe(' '.repeat(13));
    });
  });

  describe('registro de tipo 2 (declarado)', () => {
    const r = registroDeclarado(resultado.lineas[0], resultado, EMPRESA);

    it('posición 1: constante "2"', () => expect(pos(r, 1)).toBe('2'));
    it('posiciones 2-8: modelo y ejercicio', () => expect(pos(r, 2, 8)).toBe('3472026'));
    it('posiciones 9-17: NIF del declarante', () => expect(pos(r, 9, 17)).toBe('B12345674'));
    it('posiciones 18-26: NIF del declarado', () => expect(pos(r, 18, 26)).toBe('B65432106'));
    it('posiciones 27-35: NIF del representante legal, en blanco', () => {
      expect(pos(r, 27, 35)).toBe(' '.repeat(9));
    });
    it('posiciones 36-75: razón social del declarado', () => {
      expect(pos(r, 36, 75)).toBe('CLIENTE UNO SL'.padEnd(40, ' '));
    });
    it('posición 76: tipo de hoja "D"', () => expect(pos(r, 76)).toBe('D'));
    it('posiciones 77-78: código de provincia (Las Palmas = 35)', () => {
      expect(pos(r, 77, 78)).toBe('35');
    });
    it('posición 82: clave de operación B para ventas', () => expect(pos(r, 82)).toBe('B'));
    it('posiciones 83-98: importe anual con su posición de signo', () => {
      expect(pos(r, 83)).toBe(' ');
      expect(pos(r, 84, 96)).toBe('0000000005000');
      expect(pos(r, 97, 98)).toBe('00');
    });
    it('posiciones 136-151: importe del primer trimestre', () => {
      expect(pos(r, 136)).toBe(' ');
      expect(pos(r, 137, 149)).toBe('0000000004000');
      expect(pos(r, 150, 151)).toBe('00');
    });
    it('posiciones 200-215: importe del tercer trimestre', () => {
      expect(pos(r, 201, 213)).toBe('0000000001000');
    });
    it('posiciones 232-247: cuarto trimestre a cero si no hubo operaciones', () => {
      expect(pos(r, 233, 245)).toBe('0000000000000');
      expect(pos(r, 246, 247)).toBe('00');
    });
  });

  it('marca el signo con "N" cuando el importe es negativo', () => {
    const negativo = calcularModelo347(
      datos([factura({ total: -4000, issueDate: '2026-02-10' })]),
      { ejercicio: 2026 },
    );
    const r = registroDeclarado(negativo.lineas[0], negativo, EMPRESA);
    expect(pos(r, 83)).toBe('N');
    expect(pos(r, 84, 96)).toBe('0000000004000');
  });

  it('conserva los céntimos', () => {
    const conCentimos = calcularModelo347(
      datos([factura({ total: 12345.67, issueDate: '2026-02-10' })]),
      { ejercicio: 2026 },
    );
    const r = registroDeclarado(conCentimos.lineas[0], conCentimos, EMPRESA);
    expect(pos(r, 84, 96)).toBe('0000000012345');
    expect(pos(r, 97, 98)).toBe('67');
  });

  it('el fichero se llama como el NIF del declarante con extensión .347', () => {
    expect(nombreFichero347(EMPRESA)).toBe('B12345674.347');
  });
});

describe('codigoProvincia', () => {
  it('traduce las provincias del diseño oficial', () => {
    expect(codigoProvincia('Las Palmas')).toBe('35');
    expect(codigoProvincia('Santa Cruz de Tenerife')).toBe('38');
    expect(codigoProvincia('Madrid')).toBe('28');
    expect(codigoProvincia('A Coruña')).toBe('15');
  });

  it('devuelve 99 (no residente) si no se conoce la provincia', () => {
    expect(codigoProvincia(undefined)).toBe('99');
    expect(codigoProvincia('Lisboa')).toBe('99');
  });
});

describe('modelo 347 — validación', () => {
  const base = calcularModelo347(datos([factura({ total: 5000 })]), { ejercicio: 2026 });

  it('acepta datos correctos', () => {
    const v = validarModelo347(base, EMPRESA);
    expect(v.valido).toBe(true);
    expect(v.errores).toHaveLength(0);
  });

  it('rechaza un NIF de empresa inválido y dice dónde corregirlo', () => {
    const v = validarModelo347(base, { nif: 'X1234567X', businessName: 'Prueba SL' });
    expect(v.valido).toBe(false);
    expect(v.errores[0].campo).toBe('nif_declarante');
    expect(v.errores[0].referencia?.tipo).toBe('empresa');
  });

  it('rechaza un NIF de declarado inválido y apunta al tercero', () => {
    const malo = calcularModelo347(
      // El importe tiene que superar el umbral: si no, no hay línea que
      // declarar y por tanto tampoco NIF que validar.
      { facturas: [factura({ clientNif: 'B65432109', total: 5000 })], gastos: [], clientes: [] },
      { ejercicio: 2026 },
    );
    const v = validarModelo347(malo, EMPRESA);
    expect(v.valido).toBe(false);
    const err = v.errores.find(e => e.campo === 'nif_declarado');
    expect(err?.referencia?.etiqueta).toContain('B65432109');
  });

  it('avisa (sin bloquear) cuando no hay obligación de presentar', () => {
    const vacio = calcularModelo347(datos([]), { ejercicio: 2026 });
    const v = validarModelo347(vacio, EMPRESA);
    expect(v.valido).toBe(true);
    expect(v.avisos.some(a => a.campo === 'sin_datos')).toBe(true);
  });

  it('el umbral publicado es el legal', () => {
    expect(UMBRAL_347).toBe(3005.06);
  });
});

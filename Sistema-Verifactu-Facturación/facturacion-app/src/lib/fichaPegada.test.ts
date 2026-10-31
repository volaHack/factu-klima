import { describe, expect, it } from 'vitest';
import { leerFichaPegada, limpiarTelefono, nifsEnTexto, propuestaDeFicha, provinciaDelTexto } from './fichaPegada';

// Todo inventado: los NIF tienen la letra bien, pero no son de nadie.

describe('leerFichaPegada: una firma de correo', () => {
  const firma = `Buenos días,

te paso los datos para la factura.

Un saludo,
María Pérez Rodríguez
Responsable de compras
Hotel Playa Serena S.L.
CIF: B35123454
C/ Las Gaviotas 14, 35510 Tías (Las Palmas)
Tel. 928 51 22 33 | Móvil 600 11 22 33
compras@hotelplayaserena.example`;

  const f = leerFichaPegada(firma);

  it('saca la razón social por la forma jurídica', () => {
    expect(f.razonSocial).toBe('Hotel Playa Serena S.L.');
  });

  it('saca el NIF y lo comprueba', () => {
    expect(f.nif).toBe('B35123454');
    expect(f.nifValido).toBe(true);
  });

  it('saca el correo y el primer teléfono', () => {
    expect(f.email).toBe('compras@hotelplayaserena.example');
    expect(f.telefono).toBe('928 512 233');
  });

  it('separa la dirección, el código postal, el municipio y la provincia', () => {
    expect(f.direccion).toBe('C/ Las Gaviotas 14');
    expect(f.codigoPostal).toBe('35510');
    expect(f.municipio).toBe('Tías');
    expect(f.provincia).toBe('Las Palmas');
  });

  it('quien firma es la persona de contacto, no el cargo', () => {
    expect(f.contacto).toBe('María Pérez Rodríguez');
  });
});

describe('leerFichaPegada: un bloque con rótulos', () => {
  it('lee cada rótulo, se escriba como se escriba', () => {
    const f = leerFichaPegada(`Razón social: Distribuciones Ejemplo Norte SL
NIF: b-38.000.014
Domicilio: Avda. Marítima 3
CP: 38400
Población: Puerto de la Cruz
Provincia: S/C de Tenerife
Teléfono: +34 922 000 111
E-mail: Admin@Ejemplo.example
Persona de contacto: Alex Martín`);
    expect(f).toEqual({
      razonSocial: 'Distribuciones Ejemplo Norte SL',
      nif: 'B38000014',
      nifValido: true,
      direccion: 'Avda. Marítima 3',
      codigoPostal: '38400',
      municipio: 'Puerto de la Cruz',
      provincia: 'Santa Cruz de Tenerife',
      telefono: '922 000 111',
      email: 'admin@ejemplo.example',
      contacto: 'Alex Martín',
    });
  });

  it('con la dirección entera en un rótulo, separa el código postal', () => {
    const f = leerFichaPegada('Dirección: Calle Real 5, 35500 Arrecife');
    expect(f.direccion).toBe('Calle Real 5');
    expect(f.codigoPostal).toBe('35500');
    expect(f.municipio).toBe('Arrecife');
    expect(f.provincia).toBe('Las Palmas');
  });
});

describe('leerFichaPegada: lo que llega por WhatsApp', () => {
  it('un DNI, un móvil y un código postal canario sin municipio', () => {
    const f = leerFichaPegada(`Bar El Charco
Sam Herrera Díaz
dni 12345678-z
600112233
Plaza del Charco 2
38400`);
    expect(f.razonSocial).toBe('Bar El Charco');
    expect(f.contacto).toBe('Sam Herrera Díaz');
    expect(f.nif).toBe('12345678Z');
    expect(f.nifValido).toBe(true);
    expect(f.telefono).toBe('600 112 233');
    expect(f.direccion).toBe('Plaza del Charco 2');
    expect(f.codigoPostal).toBe('38400');
    // Un solo municipio para ese código: sale de la tabla.
    expect(f.municipio).toBe('Puerto de la Cruz');
    expect(f.provincia).toBe('Santa Cruz de Tenerife');
  });

  it('un NIE con espacios', () => {
    expect(leerFichaPegada('NIE X 1234567 L').nif).toBe('X1234567L');
  });

  it('un NIF con la letra mal se da, pero marcado', () => {
    const f = leerFichaPegada('CIF B35123455');
    expect(f.nif).toBe('B35123455');
    expect(f.nifValido).toBe(false);
  });

  it('el CIF con ES delante (como el VAT) se queda sin el ES', () => {
    expect(leerFichaPegada('VAT: ESB35123454').nif).toBe('B35123454');
  });

  it('un código postal con varios municipios no elige ninguno', () => {
    const f = leerFichaPegada('Avda. del Ejemplo 1\n35220');
    expect(f.codigoPostal).toBe('35220');
    expect(f.municipio).toBeUndefined();
    expect(f.provincia).toBe('Las Palmas');
  });

  it('fuera de Canarias pone la provincia por el código', () => {
    const f = leerFichaPegada('Calle Mayor 1, 28013 Madrid');
    expect(f.municipio).toBe('Madrid');
    expect(f.provincia).toBe('Madrid');
  });

  it('un texto sin datos no inventa nada', () => {
    expect(leerFichaPegada('Hola, ¿qué tal? Mañana te llamo.')).toEqual({});
    expect(leerFichaPegada('')).toEqual({});
  });

  it('las webs no se toman por razón social', () => {
    const f = leerFichaPegada('www.ejemplo.example\nCafetería La Esquina');
    expect(f.razonSocial).toBe('Cafetería La Esquina');
  });
});

describe('piezas', () => {
  it('limpiarTelefono', () => {
    expect(limpiarTelefono('+34 600-11-22-33')).toBe('600 112 233');
    expect(limpiarTelefono('0034 928123456')).toBe('928 123 456');
    expect(limpiarTelefono('12 34')).toBe('12 34');
  });

  it('nifsEnTexto pone primero los válidos y no repite', () => {
    expect(nifsEnTexto('B35123455 y B35123454 y B-35123454')).toEqual([
      { nif: 'B35123454', valido: true },
      { nif: 'B35123455', valido: false },
    ]);
    expect(nifsEnTexto('Tel 928123456')).toEqual([]);
  });

  it('provinciaDelTexto entiende las islas y las abreviaturas', () => {
    expect(provinciaDelTexto('LAS PALMAS')).toBe('Las Palmas');
    expect(provinciaDelTexto('Tenerife')).toBe('Santa Cruz de Tenerife');
    expect(provinciaDelTexto('Lanzarote')).toBe('Las Palmas');
    expect(provinciaDelTexto('S/C de Tenerife')).toBe('Santa Cruz de Tenerife');
    expect(provinciaDelTexto('Narnia')).toBeNull();
  });
});

describe('propuestaDeFicha', () => {
  const detectada = { razonSocial: 'Bar Pepe S.L.', nif: 'B35123455', nifValido: false, email: 'bar@pepe.example', codigoPostal: '35500' };

  it('marca lo que va a casillas vacías y no lo que ya está escrito', () => {
    const filas = propuestaDeFicha(detectada, { razonSocial: 'Bar Pepe', email: '' });
    expect(filas.map(f => [f.campo, f.marcada])).toEqual([
      ['razonSocial', false],
      ['nif', true],
      ['email', true],
      ['codigoPostal', true],
    ]);
    expect(filas[0].actual).toBe('Bar Pepe');
  });

  it('avisa del NIF con la letra mal', () => {
    expect(propuestaDeFicha(detectada, {}).find(f => f.campo === 'nif')?.aviso).toMatch(/control/);
  });

  it('lo que ya está igual no se repite', () => {
    expect(propuestaDeFicha({ email: 'bar@pepe.example' }, { email: 'BAR@pepe.example' })).toEqual([]);
  });
});

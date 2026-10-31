import { describe, expect, it } from 'vitest';
import { UnitOfMeasure, type InvoiceLineItem, type Product } from './types';
import {
  candidatosPara, cantidadesPara, conCajasElegidas, elegirCandidato, leerPedido, leerRenglon,
  lineaDeRenglon, partirPedido, textoCantidad,
} from './pedidoPegado';

// Un catálogo inventado de distribución de alimentación.
function producto(id: string, ref: string, name: string, extra: Partial<Product> = {}): Product {
  return {
    id, ref, name, description: '', category: '', unitPrice: 1, defaultTaxRate: 7, unit: UnitOfMeasure.UNIDAD,
    active: true, createdAt: '', updatedAt: '', ...extra,
  };
}

const catalogo: Product[] = [
  producto('ace5', 'ACE005', 'ACEITE OLIVA VIRGEN EXTRA 5 L', { unitsPerPackage: 3, unitPrice: 30 }),
  producto('ace1', 'ACE001', 'ACEITE OLIVA VIRGEN EXTRA 1 L', { unitsPerPackage: 12, unitPrice: 7 }),
  producto('acegir', 'ACE020', 'ACEITE GIRASOL 1 L', { unitsPerPackage: 15 }),
  producto('qcur', 'QUE010', 'QUESO CURADO MEZCLA 3 KG', { unitsPerPackage: 2, unit: UnitOfMeasure.KG }),
  producto('qtier', 'QUE020', 'QUESO TIERNO CABRA 1 KG'),
  producto('agua15', 'AGU015', 'AGUA MINERAL 1,5 L', { unitsPerPackage: 6 }),
  producto('agua05', 'AGU005', 'AGUA MINERAL 0,5 L', { unitsPerPackage: 24 }),
  producto('vtinto', 'VIN010', 'VINO TINTO JOVEN 75 CL', { unitsPerPackage: 6 }),
  producto('vblanco', 'VIN020', 'VINO BLANCO AFRUTADO 75 CL', { unitsPerPackage: 6 }),
  producto('coca', 'REF033', 'COCA COLA LATA 33 CL', { unitsPerPackage: 24 }),
  producto('papas', 'PAP001', 'PAPAS FRITAS CAMPESINAS 150 G', { unitsPerPackage: 20 }),
  producto('baja', 'ACE099', 'ACEITE DE ORUJO 5 L', { active: false }),
];

describe('partirPedido', () => {
  it('un renglón por línea, sin viñetas', () => {
    expect(partirPedido('- 10 cajas aceite\n• 5 queso\n\n* agua')).toEqual(['10 cajas aceite', '5 queso', 'agua']);
  });

  it('parte por comas, pero no la coma de un decimal', () => {
    expect(partirPedido('10 aceite, agua 1,5 x 20; 2 vino')).toEqual(['10 aceite', 'agua 1,5 x 20', '2 vino']);
  });

  it('parte por « y » cuando detrás viene otra cantidad', () => {
    expect(partirPedido('10 cajas aceite y 5 queso curado')).toEqual(['10 cajas aceite', '5 queso curado']);
    expect(partirPedido('vino tinto y blanco')).toEqual(['vino tinto y blanco']);
  });

  it('quita el prefijo del WhatsApp copiado y los números de lista', () => {
    expect(partirPedido('[30/10/26, 9:15] Bar Ejemplo: 10 cajas aceite')).toEqual(['10 cajas aceite']);
    expect(partirPedido('30/10/26 9:15 - Bar Ejemplo: 2 cj vino')).toEqual(['2 cj vino']);
    expect(partirPedido('1. 10 cajas aceite\n2) 5 queso')).toEqual(['10 cajas aceite', '5 queso']);
  });
});

describe('leerRenglon', () => {
  it('cajas delante, con o sin «de»', () => {
    expect(leerRenglon('10 cajas aceite')).toMatchObject({ cantidad: 10, enCajas: true, texto: 'aceite' });
    expect(leerRenglon('10 cajas de aceite de oliva')).toMatchObject({ cantidad: 10, enCajas: true, texto: 'aceite oliva' });
    expect(leerRenglon('2 cj vino tinto')).toMatchObject({ cantidad: 2, enCajas: true, texto: 'vino tinto' });
    expect(leerRenglon('3 pack coca cola')).toMatchObject({ cantidad: 3, enCajas: true, texto: 'coca cola' });
    expect(leerRenglon('1 bulto papas')).toMatchObject({ cantidad: 1, enCajas: true, texto: 'papas' });
    expect(leerRenglon('4cjs agua')).toMatchObject({ cantidad: 4, enCajas: true, texto: 'agua' });
  });

  it('un número solo: no dice si son cajas', () => {
    expect(leerRenglon('5 queso curado')).toMatchObject({ cantidad: 5, enCajas: null, texto: 'queso curado' });
    expect(leerRenglon('2x vino blanco')).toMatchObject({ cantidad: 2, enCajas: null, texto: 'vino blanco' });
  });

  it('unidades dichas', () => {
    expect(leerRenglon('6 botellas vino tinto')).toMatchObject({ cantidad: 6, enCajas: false, texto: 'vino tinto' });
    expect(leerRenglon('12 uds coca cola')).toMatchObject({ cantidad: 12, enCajas: false });
    expect(leerRenglon('2 kg queso tierno')).toMatchObject({ cantidad: 2, enCajas: false, texto: 'queso tierno' });
    expect(leerRenglon('media docena huevos')).toMatchObject({ cantidad: 6, enCajas: false, texto: 'huevos' });
  });

  it('la cantidad detrás, con «x», «:», «-» o entre paréntesis', () => {
    expect(leerRenglon('agua 1,5 x 20')).toMatchObject({ cantidad: 20, enCajas: null, texto: 'agua 1,5' });
    expect(leerRenglon('aceite: 3 cajas')).toMatchObject({ cantidad: 3, enCajas: true, texto: 'aceite' });
    expect(leerRenglon('queso tierno - 2')).toMatchObject({ cantidad: 2, texto: 'queso tierno' });
    expect(leerRenglon('vino tinto (6)')).toMatchObject({ cantidad: 6, texto: 'vino tinto' });
    expect(leerRenglon('papas 4 cj')).toMatchObject({ cantidad: 4, enCajas: true, texto: 'papas' });
    expect(leerRenglon('aceite 3')).toMatchObject({ cantidad: 3, texto: 'aceite' });
  });

  it('los números del artículo no son la cantidad', () => {
    expect(leerRenglon('agua 1,5')).toMatchObject({ cantidad: null, texto: 'agua 1,5' });
    expect(leerRenglon('33 cl coca cola')).toMatchObject({ cantidad: null, texto: '33 cl coca cola' });
    expect(leerRenglon('2 coca cola 33 cl')).toMatchObject({ cantidad: 2, texto: 'coca cola 33 cl' });
  });

  it('números escritos con letra', () => {
    expect(leerRenglon('una caja de agua')).toMatchObject({ cantidad: 1, enCajas: true, texto: 'agua' });
    expect(leerRenglon('dos cajas vino')).toMatchObject({ cantidad: 2, enCajas: true });
    expect(leerRenglon('uvas')).toMatchObject({ cantidad: null, texto: 'uvas' });
  });

  it('decimales con coma', () => {
    expect(leerRenglon('2,5 kg queso')).toMatchObject({ cantidad: 2.5, texto: 'queso' });
  });

  it('aparta lo que no es un renglón de pedido', () => {
    expect(leerRenglon('Hola Pepe')).toBeNull();
    expect(leerRenglon('Buenos días!')).toBeNull();
    expect(leerRenglon('Gracias 🙏')).toBeNull();
    expect(leerRenglon('para mañana por favor')).toBeNull();
    expect(leerRenglon('10')).toBeNull();
    expect(leerRenglon('👍')).toBeNull();
  });
});

describe('candidatosPara', () => {
  it('un artículo claro se reconoce', () => {
    const r = candidatosPara('vino tinto', catalogo);
    expect(r.claro).toBe(true);
    expect(r.candidatos[0].productId).toBe('vtinto');
  });

  it('varios iguales de buenos: dudoso, con hasta tres para elegir', () => {
    const r = candidatosPara('aceite', catalogo);
    expect(r.claro).toBe(false);
    expect(r.candidatos).toHaveLength(3);
    expect(r.candidatos.map(c => c.productId)).not.toContain('baja');
  });

  it('lo que suele pedir el cliente va primero y lo aclara', () => {
    const r = candidatosPara('aceite', catalogo, [{ productId: 'ace5' }]);
    expect(r.claro).toBe(true);
    expect(r.candidatos[0]).toMatchObject({ productId: 'ace5', habitual: true });
  });

  it('dos habituales que encajan igual siguen siendo duda, el más pedido primero', () => {
    const r = candidatosPara('aceite', catalogo, [{ productId: 'ace1' }, { productId: 'ace5' }]);
    expect(r.claro).toBe(false);
    expect(r.candidatos.slice(0, 2).map(c => c.productId)).toEqual(['ace1', 'ace5']);
  });

  it('el decimal con coma o con punto da igual', () => {
    expect(candidatosPara('agua 1.5', catalogo).candidatos[0].productId).toBe('agua15');
    expect(candidatosPara('agua 1,5', catalogo).claro).toBe(true);
  });

  it('el plural y las tildes dan igual', () => {
    expect(candidatosPara('quesos curados', catalogo).candidatos[0].productId).toBe('qcur');
    expect(candidatosPara('aceite girasól', catalogo).candidatos[0].productId).toBe('acegir');
  });

  it('con una errata se encuentra, pero como duda', () => {
    const r = candidatosPara('acete girasol', catalogo);
    expect(r.candidatos[0].productId).toBe('acegir');
    expect(r.seguro).toBe(false);
    expect(r.claro).toBe(false);
  });

  it('por referencia exacta', () => {
    const r = candidatosPara('VIN020', catalogo);
    expect(r.claro).toBe(true);
    expect(r.candidatos[0].productId).toBe('vblanco');
  });

  it('lo que no hay no se inventa', () => {
    expect(candidatosPara('jamón ibérico', catalogo).candidatos).toEqual([]);
    expect(candidatosPara('aceite orujo', catalogo).candidatos.map(c => c.productId)).not.toContain('baja');
  });
});

describe('cantidadesPara', () => {
  const ace5 = { productId: 'ace5', unitsPerPackage: 3 };

  it('cajas con unidades por caja', () => {
    expect(cantidadesPara({ cantidad: 10, enCajas: true }, ace5)).toEqual({ cajas: true, cantidad: 10 });
  });

  it('cajas sin unidades por caja: van como unidades y se dice', () => {
    const r = cantidadesPara({ cantidad: 10, enCajas: true }, { productId: 'qtier' });
    expect(r).toMatchObject({ cajas: false, cantidad: 10 });
    expect(r.nota).toMatch(/unidades por caja/);
  });

  it('sin decir, si el cliente lo pide por cajas, son cajas', () => {
    expect(cantidadesPara({ cantidad: 5, enCajas: null }, ace5, [{ productId: 'ace5', ultimasCajas: 2 }]))
      .toMatchObject({ cajas: true, cantidad: 5, nota: expect.stringMatching(/por cajas/) });
    expect(cantidadesPara({ cantidad: 5, enCajas: null }, ace5, [{ productId: 'ace5', ultimasCajas: 0 }]))
      .toEqual({ cajas: false, cantidad: 5 });
  });

  it('dichas como unidades, unidades aunque las pida por cajas', () => {
    expect(cantidadesPara({ cantidad: 5, enCajas: false }, ace5, [{ productId: 'ace5', ultimasCajas: 2 }]))
      .toEqual({ cajas: false, cantidad: 5 });
  });

  it('sin cantidad, una', () => {
    expect(cantidadesPara({ cantidad: null, enCajas: null }, ace5)).toMatchObject({ cajas: false, cantidad: 1, nota: expect.stringMatching(/1/) });
  });
});

describe('leerPedido', () => {
  const pedido = `Hola! Te paso el pedido:
10 cajas aceite
5 queso curado
agua 1,5 x 20
2 cj vino tinto
3 jamón ibérico
Gracias!!`;

  const habituales = [{ productId: 'ace5', ultimasCajas: 4 }, { productId: 'agua15', ultimasCajas: 5 }];
  const { renglones, apartados } = leerPedido(pedido, catalogo, habituales);

  it('aparta los saludos y deja solo los renglones', () => {
    expect(apartados).toEqual(['Hola! Te paso el pedido:', 'Gracias!!']);
    expect(renglones.map(r => r.original)).toEqual(['10 cajas aceite', '5 queso curado', 'agua 1,5 x 20', '2 cj vino tinto', '3 jamón ibérico']);
  });

  it('cada renglón con su estado', () => {
    expect(renglones.map(r => r.estado)).toEqual(['reconocido', 'reconocido', 'reconocido', 'reconocido', 'no-encontrado']);
    expect(renglones.map(r => r.elegido)).toEqual(['ace5', 'qcur', 'agua15', 'vtinto', null]);
  });

  it('las cajas, y las que suele pedir por cajas aunque no lo diga', () => {
    expect(renglones[0]).toMatchObject({ cajasFinal: true, cantidadFinal: 10 });
    expect(renglones[1]).toMatchObject({ cajasFinal: false, cantidadFinal: 5 });
    expect(renglones[2]).toMatchObject({ cajasFinal: true, cantidadFinal: 20, nota: expect.stringMatching(/por cajas/) });
    expect(renglones[3]).toMatchObject({ cajasFinal: true, cantidadFinal: 2 });
  });

  it('sin el cliente, «aceite» es una duda con alternativas', () => {
    const sin = leerPedido('10 cajas aceite', catalogo);
    expect(sin.renglones[0].estado).toBe('dudoso');
    expect(sin.renglones[0].candidatos.length).toBeGreaterThanOrEqual(2);
    expect(sin.renglones[0].candidatos.length).toBeLessThanOrEqual(3);
  });

  it('una frase sin cantidad que no casa con nada se aparta', () => {
    expect(leerPedido('nos vemos el lunes', catalogo)).toEqual({ renglones: [], apartados: ['nos vemos el lunes'] });
  });

  it('vacío, nada', () => {
    expect(leerPedido('', catalogo)).toEqual({ renglones: [], apartados: [] });
  });

  it('aguanta un pedido largo y un catálogo grande', () => {
    const grande = Array.from({ length: 1500 }, (_, i) => producto(`p${i}`, `R${i}`, `ARTICULO ${i} SURTIDO`));
    const texto = Array.from({ length: 40 }, (_, i) => `${i + 1} cajas articulo ${i * 7}`).join('\n');
    const inicio = performance.now();
    const r = leerPedido(texto, [...catalogo, ...grande]);
    expect(r.renglones).toHaveLength(40);
    expect(performance.now() - inicio).toBeLessThan(3000);
  });
});

describe('elegir y ajustar en la vista previa', () => {
  const [dudoso] = leerPedido('5 aceite', catalogo).renglones;

  it('elegir otro candidato rehace las cantidades', () => {
    expect(dudoso.estado).toBe('dudoso');
    const otro = dudoso.candidatos.find(c => c.productId !== dudoso.elegido)!;
    const r = elegirCandidato(dudoso, otro.productId);
    expect(r.elegido).toBe(otro.productId);
    expect(elegirCandidato(dudoso, 'no-existe')).toBe(dudoso);
  });

  it('pasar a cajas solo si el artículo tiene unidades por caja', () => {
    const conUc = elegirCandidato(dudoso, 'ace5');
    expect(conCajasElegidas(conUc, true).cajasFinal).toBe(true);
    const [queso] = leerPedido('2 queso tierno', catalogo).renglones;
    expect(conCajasElegidas(queso, true).cajasFinal).toBe(false);
  });

  it('textoCantidad', () => {
    const conUc = conCajasElegidas(elegirCandidato(dudoso, 'ace5'), true);
    expect(textoCantidad(conUc)).toBe('5 cajas × 3 = 15 uds.');
    expect(textoCantidad({ ...conUc, cajasFinal: false, cantidadFinal: 1 })).toBe('1 ud.');
  });
});

describe('lineaDeRenglon', () => {
  const base = (): InvoiceLineItem => ({
    id: 'l1', productId: '', productName: '', productRef: '', quantity: 1, unitPrice: 0, unit: UnitOfMeasure.UNIDAD,
    taxRate: 7, discountPercent: 0, cajas: 0, subtotal: 0, taxAmount: 0, total: 0,
  });
  const condiciones = (p: Product) => ({ unitPrice: p.unitPrice, descuentos: [10, 0, 0], taxRate: p.defaultTaxRate });
  const ace5 = catalogo[0];

  it('cajas × unidades por caja, con el precio de hoy', () => {
    const l = lineaDeRenglon({ cajasFinal: true, cantidadFinal: 2 }, ace5, base(), condiciones, true);
    expect(l).toMatchObject({ productId: 'ace5', cajas: 2, quantity: 6, unitsPerPackage: 3, unitPrice: 30, discountPercent: 10 });
    expect(l.subtotal).toBeCloseTo(162);
  });

  it('unidades sueltas', () => {
    expect(lineaDeRenglon({ cajasFinal: false, cantidadFinal: 4 }, ace5, base(), condiciones, true)).toMatchObject({ cajas: 0, quantity: 4 });
  });

  it('en un oficio sin casilla de cajas, las cajas van a unidades', () => {
    const { cajas: _sin, ...sinCajas } = base();
    void _sin;
    const l = lineaDeRenglon({ cajasFinal: true, cantidadFinal: 2 }, ace5, sinCajas, condiciones, false);
    expect(l.quantity).toBe(6);
    expect('cajas' in l).toBe(false);
  });
});

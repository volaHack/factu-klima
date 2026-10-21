// Los 30 dolores de cabeza y lo que hace Klimafacturas con cada uno. Cada solución es una función que el programa
// tiene de verdad (ver TREATMENT.md, «De dónde sale cada solución»). Seis capítulos de cinco.
export const CHAPTERS = [
  {
    title: 'Cobrar', items: [
      ['«Te pago la semana que viene.»', 'Recordatorios que salen solos'],
      ['Reclamar factura por factura', 'Un aviso por cliente, ya escrito'],
      ['No saber quién te debe', 'Quién debe y desde cuándo'],
      ['«¿Me pasas el número de cuenta?»', 'Paga con tarjeta o Bizum'],
      ['Apuntar a mano lo que cobras', 'Se marca pagada sola'],
    ],
  },
  {
    title: 'Hacienda', items: [
      ['«¿Mi programa cumple Verifactu?»', 'Cumple Verifactu'],
      ['Miedo a una inspección', 'Todo sellado y encadenado'],
      ['Gastarte el dinero del IVA', 'Cuánto apartar, al día'],
      ['Que se te pase el plazo', 'Aviso con los días que quedan'],
      ['Hacer los modelos a mano', '303, 130, 347… preparados'],
    ],
  },
  {
    title: 'Papeleo', items: [
      ['Facturas en Word o Excel', 'Factura sellada en 2 minutos'],
      ['La misma factura cada mes', 'Facturas que se repiten solas'],
      ['Teclear otra vez el presupuesto', 'Presupuesto a factura, en un clic'],
      ['Tickets de gasto que se pierden', 'Una foto y se rellena solo'],
      ['Facturas de proveedores por todas partes', 'Un buzón que las lee por ti'],
    ],
  },
  {
    title: 'Errores', items: [
      ['Un NIF mal escrito', 'NIF comprobado antes de emitir'],
      ['Un tipo de IVA que no existe', 'Te avisa en la propia línea'],
      ['Sumas que no cuadran', 'Cuadrado al céntimo'],
      ['Saltos en la numeración', 'Numeración correlativa, sola'],
      ['Una factura mal emitida', 'Rectificativa en un clic'],
    ],
  },
  {
    title: 'Gestoría', items: [
      ['Llevar papeles a la gestoría', 'Tu gestoría entra y lo ve'],
      ['Teclear facturas en la contabilidad', 'La contabilidad se hace sola'],
      ['Cuadrar el banco a mano', 'Subes el extracto y lo empareja'],
      ['Nóminas y préstamos, cada mes', 'Se apuntan solos'],
      ['No saber si ganas dinero', 'Resumen del mes en tu correo'],
    ],
  },
  {
    title: 'Día a día', items: [
      ['Se cae internet y no cobras', 'Sigues cobrando sin conexión'],
      ['Colas en la caja', 'TPV con lector y atajos'],
      ['Cambiar de programa da pereza', 'Importas clientes y productos'],
      ['Empleados que tocan de más', 'Cada uno ve lo que le toca'],
      ['Contratos con permanencia', 'Sin permanencia'],
    ],
  },
];

// las 30, en orden: n = 1…30, k = capítulo (0…5), i = puesto en el capítulo (0…4)
export const ITEMS = CHAPTERS.flatMap((c, k) => c.items.map(([pain, fix], i) => ({ n: k * 5 + i + 1, k, i, pain, fix })));

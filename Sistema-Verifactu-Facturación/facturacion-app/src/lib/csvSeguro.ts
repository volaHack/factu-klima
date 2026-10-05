/**
 * Que una celda de CSV no se convierta en fórmula al abrirla en Excel.
 *
 * Un nombre de cliente o de proveedor que empiece por «=», «+», «-» o «@»
 * (por ejemplo, el de una factura que llega al buzón desde fuera) Excel lo
 * ejecuta como fórmula: puede sacar datos de la hoja a otra web o lanzar
 * un programa. Con un apóstrofo delante se queda en texto, que es lo que es.
 *
 * Los números tal cual («-12,50», «+3») no se tocan: son importes.
 */
export function sinFormula(texto: string): string {
  if (!/^[=+\-@\t\r]/.test(texto)) return texto;
  if (/^[-+]?\d+([.,]\d+)*$/.test(texto)) return texto;
  return `'${texto}`;
}

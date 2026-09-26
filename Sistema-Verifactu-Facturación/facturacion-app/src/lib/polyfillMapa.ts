/**
 * Map/WeakMap.prototype.getOrInsert y getOrInsertComputed.
 *
 * pdf.js 6 los usa y muchos navegadores todavía no los traen (Chrome y
 * Safari de hace pocos meses): sin esto, abrir un PDF —en Diseño de
 * documentos o en la bandeja de facturas— fallaba con «getOrInsertComputed
 * is not a function». El worker lleva la misma copia en
 * public/pdfjs/mapa-polyfill.mjs.
 */
export function ponerPolyfillMapa(): void {
  for (const C of [Map, WeakMap] as unknown as { prototype: Record<string, unknown> }[]) {
    if (!C.prototype.getOrInsert) {
      Object.defineProperty(C.prototype, 'getOrInsert', {
        value(this: Map<unknown, unknown>, clave: unknown, valor: unknown) {
          if (this.has(clave)) return this.get(clave);
          this.set(clave, valor);
          return valor;
        },
        configurable: true, writable: true,
      });
    }
    if (!C.prototype.getOrInsertComputed) {
      Object.defineProperty(C.prototype, 'getOrInsertComputed', {
        value(this: Map<unknown, unknown>, clave: unknown, calcular: (k: unknown) => unknown) {
          if (this.has(clave)) return this.get(clave);
          const valor = calcular(clave);
          this.set(clave, valor);
          return valor;
        },
        configurable: true, writable: true,
      });
    }
  }
}

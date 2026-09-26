// Map/WeakMap.prototype.getOrInsert y getOrInsertComputed (propuesta «upsert»).
// pdf.js 6 los usa, y muchos navegadores todavía no los tienen: sin esto,
// abrir cualquier PDF falla con «getOrInsertComputed is not a function».
// Lo carga el worker (pdf.worker.compat.mjs) antes que pdf.js.
for (const C of [Map, WeakMap]) {
  if (!C.prototype.getOrInsert) {
    Object.defineProperty(C.prototype, 'getOrInsert', {
      value(clave, valor) { if (this.has(clave)) return this.get(clave); this.set(clave, valor); return valor; },
      configurable: true, writable: true,
    });
  }
  if (!C.prototype.getOrInsertComputed) {
    Object.defineProperty(C.prototype, 'getOrInsertComputed', {
      value(clave, calcular) { if (this.has(clave)) return this.get(clave); const valor = calcular(clave); this.set(clave, valor); return valor; },
      configurable: true, writable: true,
    });
  }
}

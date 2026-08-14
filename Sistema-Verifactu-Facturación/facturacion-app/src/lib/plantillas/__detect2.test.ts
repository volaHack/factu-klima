// @ts-nocheck
/** TEMPORAL — diagnóstico de la detección sobre los PDFs del usuario. */
import { createCanvas, DOMMatrix, Path2D } from '@napi-rs/canvas';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { beforeAll, describe, it } from 'vitest';
import { extraerPagina, lineasHorizontales, muestrearColor } from './extraccion';
import { detectar } from './deteccion';

const require = createRequire(import.meta.url);

const PDFS = [
  'C:/Users/volit/Downloads/Sucamosa 4 - 26003239.pdf',
  'C:/Users/volit/Downloads/modelo-de-factura.pdf',
];

beforeAll(async () => {
  globalThis.fetch = (async (entrada: RequestInfo | URL) => {
    const ruta = String(entrada);
    const archivo = readFileSync(`${process.cwd()}/public${ruta.replace(/^\//, '/')}`);
    return new Response(new Uint8Array(archivo), { status: 200 });
  }) as typeof fetch;
  // @ts-expect-error shim mínimo
  globalThis.document = {
    createElement: (etiqueta: string) => {
      if (etiqueta !== 'canvas') throw new Error('sólo canvas');
      return createCanvas(1, 1);
    },
  };
  // @ts-expect-error shim mínimo
  globalThis.ImageData = class {};
  // @ts-expect-error pdf.js moderno lo necesita en Node
  globalThis.DOMMatrix = DOMMatrix;
  // @ts-expect-error pdf.js moderno lo necesita en Node
  globalThis.Path2D = Path2D;
  // Node 24 no expone Uint8Array.prototype.toHex (ES2025); pdf.js lo usa.
  if (typeof Uint8Array.prototype.toHex !== 'function') {
    Object.defineProperty(Uint8Array.prototype, 'toHex', {
      value: function toHex() {
        return Buffer.from(this as unknown as Uint8Array).toString('hex');
      },
    });
  }
  if (typeof (Uint8Array as unknown as { fromHex?: unknown }).fromHex !== 'function') {
    Object.defineProperty(Uint8Array, 'fromHex', {
      value: function fromHex(hex: string) {
        return new Uint8Array(Buffer.from(hex, 'hex'));
      },
    });
  }
  if (typeof Uint8Array.prototype.toBase64 !== 'function') {
    Object.defineProperty(Uint8Array.prototype, 'toBase64', {
      value: function toBase64(opts?: { alphabet?: 'base64' | 'base64url'; omitPadding?: boolean }) {
        let s = Buffer.from(this as unknown as Uint8Array).toString('base64');
        if (opts?.alphabet === 'base64url') s = s.replace(/\+/g, '-').replace(/\//g, '_');
        if (opts?.omitPadding) s = s.replace(/=+$/, '');
        return s;
      },
    });
  }
  if (typeof (Uint8Array as unknown as { fromBase64?: unknown }).fromBase64 !== 'function') {
    Object.defineProperty(Uint8Array, 'fromBase64', {
      value: function fromBase64(s: string, opts?: { alphabet?: 'base64' | 'base64url' }) {
        let t = s;
        if (opts?.alphabet === 'base64url') t = t.replace(/-/g, '+').replace(/_/g, '/');
        return new Uint8Array(Buffer.from(t, 'base64'));
      },
    });
  }
  if (typeof Map.prototype.getOrInsert !== 'function') {
    Object.defineProperty(Map.prototype, 'getOrInsert', {
      value: function getOrInsert<K, V>(this: Map<K, V>, clave: K, valor: V): V {
        if (!this.has(clave)) this.set(clave, valor);
        return this.get(clave) as V;
      },
    });
  }
  if (typeof Map.prototype.getOrInsertComputed !== 'function') {
    Object.defineProperty(Map.prototype, 'getOrInsertComputed', {
      value: function getOrInsertComputed<K, V>(this: Map<K, V>, clave: K, calcular: (clave: K) => V): V {
        if (!this.has(clave)) this.set(clave, calcular(clave));
        return this.get(clave) as V;
      },
    });
  }
  // pdf.js en Node no puede `import('/pdfjs/...')` (worker). Lo cargamos aquí
  // para que el «main thread worker» esté disponible y no haga fake worker.
  globalThis.pdfjsWorker = await import(
    pathToFileURL(require.resolve('pdfjs-dist/build/pdf.worker.min.mjs')).href,
  );
});

describe('diagnóstico de detección', () => {
  for (const ruta of PDFS) {
    it(ruta.split('/').pop(), async () => {
      if (!existsSync(ruta)) {
        console.log('NO EXISTE:', ruta);
        return;
      }
      const buffer = readFileSync(ruta);
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
        await pdfjs.getDocument({
          data: new Uint8Array(buffer),
          isEvalSupported: false,
          useSystemFonts: true,
        }).promise;
      } catch (e) {
        console.log('ERROR REAL:', e instanceof Error ? e.message : String(e));
      }
      const pagina = await extraerPagina(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
      const { pxPorMm } = pagina.bitmap;
      const analisis = detectar(pagina, {
        ajustes: null,
        muestrear: (x, y, ancho, alto) =>
          muestrearColor(pagina.pixeles, x * pxPorMm, y * pxPorMm, ancho * pxPorMm, alto * pxPorMm),
        buscarLineas: (x, ancho, y, alto) =>
          lineasHorizontales(
            pagina.pixeles, x * pxPorMm, (x + ancho) * pxPorMm, y * pxPorMm, (y + alto) * pxPorMm,
          ).map(pxY => pxY / pxPorMm),
      });

      console.log('=== TEXTOS (líneas agrupadas) ===');
      for (const linea of pagina.lineas) {
        console.log(`y=${linea.y.toFixed(1)} :: ` + linea.segmentos.map(s => `«${s.texto}»[${s.x.toFixed(0)},${s.y.toFixed(0)}]`).join(' '));
      }

      console.log('=== CAMPOS DETECTADOS ===');
      for (const c of analisis.campos) {
        console.log(`clave=${c.clave ?? 'SIN'} conf=${c.confianza?.toFixed(2)} fijo=${c.fijo} «${c.valorOriginal ?? ''}» x=${c.x.toFixed(1)} y=${c.y.toFixed(1)} motivo=${c.motivo}`);
      }

      if (analisis.tabla) {
        console.log('=== TABLA ===');
        console.log(`x=${analisis.tabla.x.toFixed(1)} y=${analisis.tabla.y.toFixed(1)} ancho=${analisis.tabla.ancho.toFixed(1)} altoTotal=${analisis.tabla.altoTotal.toFixed(1)}`);
        for (const col of analisis.tabla.columnas) {
          console.log(`  col: clave=${col.clave ?? 'SIN'} cabecera=«${col.cabecera}» x=${col.x.toFixed(1)} ancho=${col.ancho.toFixed(1)} alin=${col.alineacion}`);
        }
      } else {
        console.log('=== SIN TABLA DETECTADA ===');
      }

      console.log('=== AVISOS ===');
      for (const a of analisis.avisos) console.log(`[${a.nivel}] ${a.texto}`);
    }, 120_000);
  }
});

// @ts-nocheck
/** TEMPORAL — diagnóstico del troceado de texto. */
import { describe, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { agruparEnLineas } from './extraccion';
import type { ItemTexto } from './tipos';

const PT_A_MM = 25.4 / 72;

describe('diagnóstico', () => {
  it('vuelca los items del PDF del usuario', async () => {
    const ruta = 'C:/Users/volit/Downloads/ALB-2026-0009.pdf';
    if (!existsSync(ruta)) return;
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdf = readFileSync(ruta);
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), isEvalSupported: false }).promise;
    const pagina = await doc.getPage(1);
    const vista = pagina.getViewport({ scale: 1 });
    const contenido = await pagina.getTextContent();
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const estilos: Record<string, any> = contenido.styles ?? {};

    const items: ItemTexto[] = [];
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    for (const bruto of contenido.items as any[]) {
      if (typeof bruto.str !== 'string' || bruto.str.trim() === '') continue;
      const t = pdfjs.Util.transform(vista.transform, bruto.transform);
      const tamano = Math.hypot(t[1], t[3]) || Math.abs(t[3]) || 10;
      const estilo = estilos[bruto.fontName] ?? {};
      const asc = typeof estilo.ascent === 'number' && estilo.ascent > 0 ? estilo.ascent : 0.78;
      const desc = typeof estilo.descent === 'number' ? Math.abs(estilo.descent) : 0.22;
      items.push({
        texto: bruto.str,
        x: t[4] * PT_A_MM,
        y: (t[5] - tamano * asc) * PT_A_MM,
        ancho: (bruto.width || bruto.str.length * tamano * 0.5) * PT_A_MM,
        alto: tamano * (asc + desc) * PT_A_MM,
        tamano, fuente: estilo.fontFamily ?? '', negrita: false, cursiva: false,
        serif: false, monoespaciada: false, color: '#000',
      });
    }

    console.log('=== ITEMS BRUTOS ===');
    for (const i of items) {
      console.log(`"${i.texto}" | x=${i.x.toFixed(1)} ancho=${i.ancho.toFixed(1)} dcha=${(i.x + i.ancho).toFixed(1)} y=${i.y.toFixed(1)} tam=${i.tamano.toFixed(1)}`);
    }
    console.log('=== SEGMENTOS ===');
    for (const linea of agruparEnLineas(items)) {
      console.log(`y=${linea.y.toFixed(1)} :: ` + linea.segmentos.map(s => `[${s.texto}]`).join(' '));
    }
  }, 120_000);
});

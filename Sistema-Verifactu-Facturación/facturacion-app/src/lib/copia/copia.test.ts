/**
 * REGRESIÓN DE LA AUDITORÍA · COPIAS QUE SIRVEN PARA RESTAURAR
 *
 * La copia de prueba (`__fixtures__`) la generó scripts/prueba-restauracion
 * desde PostgreSQL, con la cadena Veri*Factu calculada por las funciones SQL
 * de producción. Que aquí la verifique `huella.ts` demuestra que las dos
 * implementaciones de la huella dan lo mismo. Empresa inventada: sin datos reales.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonico, construirCopia, manifiestoDe, sha256Hex, TABLAS } from './nucleo.mjs';
import { verificarCopia, type CopiaEmpresa } from './verificar';

const copia = (): CopiaEmpresa => JSON.parse(readFileSync(join(__dirname, '__fixtures__', 'copia-empresa-inventada.json'), 'utf8'));

describe('verificar una copia', () => {
  it('la copia hecha desde el servidor de prueba es íntegra y su cadena cuadra', async () => {
    const r = await verificarCopia(copia());
    expect(r.problemas).toEqual([]);
    expect(r.resumen).toMatchObject({ registrosVerifactu: 4, facturasSelladas: 3 });
  });

  it('detecta un importe cambiado (no cuadra con el manifiesto)', async () => {
    const c = copia();
    (c.tablas!.invoices.find(f => f.number === 'F-2026-0003')!).total = 1;
    const r = await verificarCopia(c);
    expect(r.ok).toBe(false);
    expect(r.problemas.join(' ')).toMatch(/invoices: el contenido no cuadra/);
  });

  it('detecta un registro fiscal falsificado aunque se rehaga el manifiesto', async () => {
    const c = copia();
    (c.tablas!.verifactu_registros.find(r => r.num_serie === 'F-2026-0003' && r.tipo_registro === 'alta')!).importe_total = 1;
    c.manifiesto = await manifiestoDe(c.tablas!);
    c.huellaCopia = await sha256Hex(canonico(c.manifiesto));
    const r = await verificarCopia(c);
    expect(r.problemas.join(' ')).toMatch(/F-2026-0003\): su huella no se corresponde/);
  });

  it('detecta que falta un registro de la cadena', async () => {
    const c = copia();
    c.tablas!.verifactu_registros = c.tablas!.verifactu_registros.filter(r => Number(r.indice) !== 2);
    c.manifiesto = await manifiestoDe(c.tablas!);
    c.huellaCopia = await sha256Hex(canonico(c.manifiesto));
    const r = await verificarCopia(c);
    expect(r.problemas.join(' ')).toMatch(/Falta el registro 2/);
  });
});

describe('construir una copia', () => {
  it('lee cada tabla por su cuenta o por su madre, y quita las credenciales', async () => {
    const pedidas: string[] = [];
    const leer = async (tabla: string, f: { columna: string; valores: string[] }) => {
      pedidas.push(`${tabla}:${f.columna}`);
      if (tabla === 'invoices') return [{ id: 'i1', user_id: 'u' }];
      if (tabla === 'company_settings') return [{ id: 's', user_id: 'u', stripe_customer_id: 'cus_x', business_name: 'E' }];
      if (tabla === 'perfiles_trabajo') return [{ id: 'p', user_id: 'u', pin_hash: 'h', pin_sal: 's', nombre: 'Caja' }];
      return [];
    };
    const c = await construirCopia(leer, 'u', new Date('2026-10-25T00:00:00Z'));
    expect(pedidas).toContain('invoice_line_items:invoice_id');
    expect(pedidas).toContain('invoices:user_id');
    expect(c.tablas.company_settings[0]).not.toHaveProperty('stripe_customer_id');
    expect(c.tablas.perfiles_trabajo[0]).toEqual({ id: 'p', user_id: 'u', nombre: 'Caja' });
    expect(Object.keys(c.manifiesto)).toHaveLength(TABLAS.length);
    expect(c.excluido).toHaveProperty('verifactu_certificates');
  });
});

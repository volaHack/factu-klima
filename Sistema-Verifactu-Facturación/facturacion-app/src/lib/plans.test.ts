import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLANS, getPlan, ANNUAL_MONTHS_FREE } from './plans';

/**
 * Lee el límite por plan que aplica de verdad la base de datos.
 *
 * `fn_plan_invoice_limit` se ha redefinido varias veces (la 005 la creó
 * con 15 para el básico, la 014 la subió a 25), así que vale la ÚLTIMA
 * migración por orden de nombre que la reescriba — que es el orden en
 * que se ejecutan.
 */
function limitesSegunSQL(): Record<string, number | null> {
  const dir = join(__dirname, '..', '..', 'supabase');
  const ultima = readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .filter(f => readFileSync(join(dir, f), 'utf8')
      .includes('CREATE OR REPLACE FUNCTION fn_plan_invoice_limit'))
    .pop();

  if (!ultima) throw new Error('Ninguna migración define fn_plan_invoice_limit');

  const sql = readFileSync(join(dir, ultima), 'utf8');
  const cuerpo = sql.slice(sql.lastIndexOf('CREATE OR REPLACE FUNCTION fn_plan_invoice_limit'));
  const limites: Record<string, number | null> = {};
  for (const [, plan, valor] of cuerpo.matchAll(/WHEN\s+'(\w+)'\s+THEN\s+(\d+|NULL)/gi)) {
    limites[plan] = valor.toUpperCase() === 'NULL' ? null : Number(valor);
  }
  return limites;
}

describe('plans', () => {
  it('el precio anual es 10x el mensual (2 meses gratis) en los tres planes', () => {
    for (const plan of PLANS) {
      expect(plan.priceAnnual).toBe(plan.priceMonthly * 10);
    }
  });

  it('getPlan devuelve el plan por id', () => {
    expect(getPlan('pro')?.invoiceLimit).toBe(100);
  });

  it('el plan básico permite 25 facturas al mes', () => {
    expect(getPlan('basico')?.invoiceLimit).toBe(25);
  });

  it('getPlan devuelve undefined para un id desconocido', () => {
    expect(getPlan('inventado')).toBeUndefined();
  });

  it('"sin_limite" no tiene tope de facturas', () => {
    expect(getPlan('sin_limite')?.invoiceLimit).toBeNull();
  });

  it('ANNUAL_MONTHS_FREE es 2, consistente con el 10x', () => {
    expect(ANNUAL_MONTHS_FREE).toBe(2);
  });

  /**
   * El descuadre que este test existe para impedir: `plans.ts` manda en
   * lo que la página PROMETE, y `fn_plan_invoice_limit` manda en lo que
   * el programa ENTREGA (el trigger rechaza el INSERT al llegar al
   * tope). Si se separan, se cobra por facturas que no se pueden emitir.
   * El aviso en el comentario de plans.ts ya estaba; los comentarios no
   * fallan la CI.
   */
  it('el límite de cada plan coincide con el que aplica la base de datos', () => {
    const sql = limitesSegunSQL();
    for (const plan of PLANS) {
      expect(sql, `el plan ${plan.id} no aparece en fn_plan_invoice_limit`).toHaveProperty(plan.id);
      expect(sql[plan.id], `descuadre en el plan ${plan.id}`).toBe(plan.invoiceLimit);
    }
  });
});

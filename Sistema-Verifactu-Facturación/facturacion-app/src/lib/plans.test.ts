import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLANS, PLAN_MOSTRADOR, getPlan, ANNUAL_MONTHS_FREE } from './plans';

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
      .match(/CREATE OR REPLACE FUNCTION\s+(?:public\.)?fn_plan_invoice_limit/))
    .pop();

  if (!ultima) throw new Error('Ninguna migración define fn_plan_invoice_limit');

  const sql = readFileSync(join(dir, ultima), 'utf8');
  // La ÚLTIMA definición del fichero: `(?!…)` descarta cualquier
  // coincidencia que tenga otra por delante. El nombre puede venir con
  // el esquema o sin él (`public.fn_plan_invoice_limit`), y buscarlo sin
  // contemplar el prefijo hacía que este test leyera una migración vieja
  // y diera por buenos límites que ya no son los que aplica la base.
  const cuerpo = sql.slice(sql.search(
    /CREATE OR REPLACE FUNCTION\s+(?:public\.)?fn_plan_invoice_limit(?![\s\S]*CREATE OR REPLACE FUNCTION\s+(?:public\.)?fn_plan_invoice_limit)/
  ));
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

  /**
   * El TPV va aparte de PLANS (no compite con los otros tres), pero se
   * contrata igual y la base de datos le aplica su propio tope. Si
   * alguien cambia uno de los dos sitios, esto lo caza.
   */
  it('el plan TPV se encuentra por id y cuesta menos que el básico', () => {
    expect(getPlan('tpv')).toBe(PLAN_MOSTRADOR);
    expect(PLAN_MOSTRADOR.priceMonthly).toBeLessThan(PLANS[0].priceMonthly);
    expect(PLAN_MOSTRADOR.priceAnnual).toBe(PLAN_MOSTRADOR.priceMonthly * 10);
  });

  it('el tope de facturas completas del TPV coincide con el de la base de datos', () => {
    expect(limitesSegunSQL().tpv).toBe(PLAN_MOSTRADOR.invoiceLimit);
  });
});

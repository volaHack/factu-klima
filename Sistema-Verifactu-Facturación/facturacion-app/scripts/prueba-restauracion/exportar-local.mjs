#!/usr/bin/env node
// @ts-check
/**
 * Hace la copia de una cuenta desde una base PostgreSQL LOCAL (la de la
 * prueba), con el mismo `construirCopia` que usa /api/copia contra Supabase.
 *   PGDATABASE=origen node exportar-local.mjs <user_id> > copia.json
 */
import { construirCopia } from '../../src/lib/copia/nucleo.mjs';
import { psql } from '../restaurar-copia.mjs';

const literal = (v) => `'${String(v).replace(/'/g, "''")}'`;
const cuenta = process.argv[2];
const leer = async (tabla, filtro) => {
  const orden = tabla === 'verifactu_config' ? 'user_id' : 'id';
  const lista = filtro.valores.map(literal).join(',');
  return JSON.parse(psql(`SELECT COALESCE(json_agg(x ORDER BY x.${orden}), '[]') FROM public.${tabla} x WHERE ${filtro.columna} IN (${lista})`) || '[]');
};
const copia = await construirCopia(leer, cuenta);
process.stdout.write(JSON.stringify(copia, null, 1));

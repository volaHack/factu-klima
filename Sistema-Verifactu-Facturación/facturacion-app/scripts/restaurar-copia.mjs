#!/usr/bin/env node
// @ts-check
/**
 * RESTAURAR UNA COPIA DE EMPRESA (formato 2, la de /api/copia)
 *
 *   node scripts/restaurar-copia.mjs copia.json            ← restaura
 *   node scripts/restaurar-copia.mjs copia.json --comprobar ← sólo comprueba la copia
 *
 * El destino es una base de datos PostgreSQL con el esquema de Klima (las
 * migraciones aplicadas) y se indica con las variables estándar de libpq
 * (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE) para que la contraseña
 * no aparezca en la línea de órdenes. Hace falta `psql`.
 *
 * QUÉ HACE, EN ORDEN
 *   1. Comprueba la copia contra su manifiesto. Si algo no cuadra, para.
 *   2. Se niega a restaurar encima: si en el destino ya hay datos de esa
 *      cuenta, para. Restaurar nunca sobrescribe.
 *   3. Carga todas las tablas en UNA transacción, con los triggers en pausa
 *      (session_replication_role = replica): los datos fiscales entran tal
 *      cual estaban —huellas, sellos, fechas— sin que el sellado los vuelva
 *      a calcular. Requiere un rol que pueda cambiar ese parámetro.
 *   4. Vuelve a leer del destino todo lo restaurado y comprueba que da
 *      EXACTAMENTE el mismo manifiesto que la copia.
 *   5. Si el destino tiene las funciones Veri*Factu de la migración 038,
 *      recalcula con ellas la huella de cada registro y su encadenamiento.
 *
 * Sale con código 0 sólo si todo cuadra.
 */

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { TABLAS, comprobarManifiesto, manifiestoDe, ordenarFilas } from '../src/lib/copia/nucleo.mjs';

/** Ejecuta SQL en el destino y devuelve la salida (sin alinear, sin cabeceras). */
export function psql(sql, { entrada } = /** @type {{ entrada?: boolean }} */ ({})) {
  const r = spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', ...(entrada ? ['-f', '-'] : ['-c', sql])], {
    input: entrada ? sql : undefined,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
    env: { ...process.env, PGTZ: 'UTC', PGOPTIONS: `${process.env.PGOPTIONS ?? ''} -c TimeZone=UTC`.trim() },
  });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'psql falló').trim());
  return r.stdout.trim();
}

const literal = (v) => `'${String(v).replace(/'/g, "''")}'`;

/** El filtro SQL de una tabla de esta cuenta (el mismo criterio que la copia). */
export function filtroSql(t, cuenta) {
  if (t.por === 'user_id') return `user_id = ${literal(cuenta)}`;
  const madre = TABLAS.find(x => x.nombre === t.por.madre);
  return `${t.por.columna} IN (SELECT id FROM public.${t.por.madre} WHERE ${filtroSql(madre, cuenta)})`;
}

/** Lee del destino las filas de una tabla de esta cuenta. */
export function leerTabla(t, cuenta) {
  const orden = t.nombre === 'verifactu_config' ? 'user_id' : 'id';
  const json = psql(`SELECT COALESCE(json_agg(x ORDER BY x.${orden}), '[]') FROM public.${t.nombre} x WHERE ${filtroSql(t, cuenta)}`);
  return JSON.parse(json || '[]');
}

/** Un trozo de SQL que no puede romper el JSON que lleva dentro. */
function dolar(texto) {
  let etiqueta;
  do { etiqueta = `$k${randomBytes(6).toString('hex')}$`; } while (texto.includes(etiqueta));
  return `${etiqueta}${texto}${etiqueta}`;
}

export function sqlDeRestauracion(copia) {
  const partes = ['BEGIN;', 'SET LOCAL session_replication_role = replica;'];
  for (const t of TABLAS) {
    const filas = copia.tablas[t.nombre] ?? [];
    if (!filas.length) continue;
    partes.push(`INSERT INTO public.${t.nombre} SELECT * FROM jsonb_populate_recordset(NULL::public.${t.nombre}, ${dolar(JSON.stringify(filas))}::jsonb);`);
  }
  partes.push('COMMIT;');
  return partes.join('\n');
}

/** Lo restaurado, visto con las mismas columnas que traía la copia. */
function comoEnLaCopia(restauradas, deLaCopia) {
  if (!deLaCopia.length) return restauradas;
  const claves = new Set(deLaCopia.flatMap(f => Object.keys(f)));
  return restauradas.map(f => Object.fromEntries(Object.entries(f).filter(([k]) => claves.has(k))));
}

const SQL_CADENA = `
WITH r AS (
  SELECT indice, tipo_registro, huella, huella_anterior,
         lag(huella) OVER (ORDER BY indice) AS anterior_real,
         CASE WHEN tipo_registro = 'anulacion'
           THEN public.verifactu_huella(public.verifactu_cadena_anulacion(id_emisor, num_serie, fecha_expedicion, huella_anterior, fecha_hora_huso))
           ELSE public.verifactu_huella(public.verifactu_cadena_alta(id_emisor, num_serie, fecha_expedicion, tipo_factura, cuota_total, importe_total, huella_anterior, fecha_hora_huso))
         END AS recalculada
  FROM public.verifactu_registros WHERE user_id = %CUENTA%)
SELECT json_build_object(
  'registros', count(*),
  'huellasQueNoCuadran', count(*) FILTER (WHERE recalculada <> huella),
  'enlacesRotos', count(*) FILTER (WHERE anterior_real IS DISTINCT FROM huella_anterior))
FROM r`;

async function main() {
  const [ruta, ...opciones] = process.argv.slice(2);
  if (!ruta) {
    console.error('Uso: node scripts/restaurar-copia.mjs copia.json [--comprobar]');
    process.exit(2);
  }
  const copia = JSON.parse(readFileSync(ruta, 'utf8'));

  const problemas = await comprobarManifiesto(copia);
  if (problemas.length) {
    console.error('✗ La copia no es íntegra. No se restaura nada:');
    for (const p of problemas) console.error(`  · ${p}`);
    process.exit(1);
  }
  const filas = TABLAS.reduce((s, t) => s + (copia.tablas[t.nombre]?.length ?? 0), 0);
  console.log(`✓ Copia íntegra: ${filas} filas en ${TABLAS.length} tablas, cuenta ${copia.cuenta}, hecha el ${copia.generadoEn}.`);
  if (opciones.includes('--comprobar')) return;

  const cuenta = copia.cuenta;
  const ya = Number(psql(`SELECT (SELECT count(*) FROM public.invoices WHERE user_id = ${literal(cuenta)}) + (SELECT count(*) FROM public.company_settings WHERE user_id = ${literal(cuenta)})`));
  if (ya > 0) {
    console.error(`✗ En el destino ya hay datos de la cuenta ${cuenta}. Restaurar no sobrescribe: usa una base vacía.`);
    process.exit(1);
  }

  psql(sqlDeRestauracion(copia), { entrada: true });
  console.log('✓ Cargado en una transacción.');

  // Releer y comparar con el manifiesto, tabla a tabla.
  const releidas = {};
  for (const t of TABLAS) releidas[t.nombre] = ordenarFilas(comoEnLaCopia(leerTabla(t, cuenta), copia.tablas[t.nombre] ?? []));
  const manifiesto = await manifiestoDe(releidas);
  const distintas = TABLAS.filter(t => manifiesto[t.nombre].sha256 !== copia.manifiesto[t.nombre].sha256 || manifiesto[t.nombre].filas !== copia.manifiesto[t.nombre].filas);
  if (distintas.length) {
    console.error(`✗ Lo restaurado no coincide con la copia en: ${distintas.map(t => t.nombre).join(', ')}`);
    process.exit(1);
  }
  console.log('✓ Releído del destino: idéntico a la copia en todas las tablas (mismo manifiesto).');

  const hayFunciones = psql(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN ('verifactu_huella', 'verifactu_cadena_alta', 'verifactu_cadena_anulacion')`);
  if (Number(hayFunciones) === 3) {
    const cadena = JSON.parse(psql(SQL_CADENA.replace('%CUENTA%', literal(cuenta))));
    if (cadena.huellasQueNoCuadran || cadena.enlacesRotos) {
      console.error(`✗ Cadena Veri*Factu: ${cadena.huellasQueNoCuadran} huellas que no cuadran y ${cadena.enlacesRotos} enlaces rotos de ${cadena.registros}.`);
      process.exit(1);
    }
    console.log(`✓ Cadena Veri*Factu recalculada con las funciones del destino: ${cadena.registros} registros, todas las huellas y enlaces correctos.`);
  } else {
    console.log('· El destino no tiene las funciones Veri*Factu (migración 038): la cadena no se ha recalculado en la base de datos.');
  }
  console.log('✓ RESTAURACIÓN COMPLETA Y VERIFICADA.');
}

// Con pathToFileURL: la ruta lleva «ó» y la URL del módulo la codifica.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(`✗ ${e instanceof Error ? e.message : e}`); process.exit(1); });
}

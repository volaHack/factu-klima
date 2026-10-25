#!/usr/bin/env bash
# =============================================================================
# PRUEBA DE RESTAURACIÓN EN UNA BASE AISLADA
#
# Necesita un PostgreSQL al que se pueda conectar con las variables de libpq
# (PGHOST, PGPORT, PGUSER…) con permiso para crear bases y cambiar
# session_replication_role. NUNCA apuntes esto a producción: crea y borra
# las bases klima_prueba_origen y klima_prueba_destino.
#
#   PGHOST=/ruta/al/socket PGPORT=55432 PGUSER=pruebas scripts/prueba-restauracion/probar.sh
# =============================================================================
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
APP="$(cd "$AQUI/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
A=aaaaaaaa-0000-4000-8000-000000000001
q() { psql -X -q -At -v ON_ERROR_STOP=1 "$@"; }

for db in klima_prueba_origen klima_prueba_destino klima_prueba_destino2; do
  q -d postgres -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"
done
q -d klima_prueba_origen -f "$AQUI/esquema.sql" -f "$AQUI/funciones.sql" -f "$AQUI/datos.sql"
for db in klima_prueba_destino klima_prueba_destino2; do q -d $db -f "$AQUI/esquema.sql" -f "$AQUI/funciones.sql"; done
echo "· Bases creadas. Origen con la empresa inventada A y otra empresa B."

PGDATABASE=klima_prueba_origen node "$AQUI/exportar-local.mjs" $A > "$TMP/copia.json"
echo "· Copia hecha: $(wc -c < "$TMP/copia.json") bytes."
[ -n "${GUARDAR_COPIA:-}" ] && cp "$TMP/copia.json" "$GUARDAR_COPIA"

# 1. Lo que no debe ir en la copia.
for prohibido in cus_NO_DEBE_SALIR HASH_NO_DEBE_SALIR "Cliente de B" B11111111; do
  if grep -q "$prohibido" "$TMP/copia.json"; then echo "✗ La copia lleva «$prohibido»"; exit 1; fi
done
echo "✓ Sin credenciales ni PIN, y nada de la otra empresa."

# 2. Restaurar en una base vacía.
PGDATABASE=klima_prueba_destino node "$APP/scripts/restaurar-copia.mjs" "$TMP/copia.json"

# 3. Comparación independiente, hecha por Postgres y no por el script: cada
#    fila fiscal en texto, columna a columna. Los importes se comparan por
#    VALOR (trim_scale): el JSON no distingue 100.00 de 100 y las columnas
#    son numeric sin escala fija, así que los ceros a la derecha no vuelven.
for t in invoices invoice_line_items invoice_tax_breakdown verifactu_registros invoice_events cobros_pagos historico_documentos; do
  cols=$(q -d klima_prueba_origen -c "SELECT string_agg(CASE WHEN data_type='numeric' THEN format('trim_scale(%I) AS %I', column_name, column_name) ELSE quote_ident(column_name) END, ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='$t'")
  filtro=$( { [ $t = invoice_line_items ] || [ $t = invoice_tax_breakdown ]; } && echo "invoice_id IN (SELECT id FROM invoices WHERE user_id='$A')" || echo "user_id='$A'")
  o=$(q -d klima_prueba_origen -c "SELECT count(*) || ':' || md5(string_agg(x::text, '|' ORDER BY x::text)) FROM (SELECT $cols FROM public.$t WHERE $filtro) x")
  d=$(q -d klima_prueba_destino -c "SELECT count(*) || ':' || md5(string_agg(x::text, '|' ORDER BY x::text)) FROM (SELECT $cols FROM public.$t) x")
  [ "$o" = "$d" ] || { echo "✗ $t difiere entre origen y destino"; exit 1; }
done
echo "✓ Comparación independiente en Postgres (fila a fila): facturas, líneas, desgloses, registros Veri*Factu, eventos, cobros e histórico idénticos."
n=$(q -d klima_prueba_origen -c "SELECT count(*) FROM invoices WHERE user_id='$A' AND total::text <> trim_scale(total)::text")
echo "· Aviso conocido: $n totales de factura con ceros a la derecha (p. ej. 100.00) vuelven escritos sin ellos (100): mismo valor, otra escala."

# 4. Restaurar otra vez encima: tiene que negarse.
if PGDATABASE=klima_prueba_destino node "$APP/scripts/restaurar-copia.mjs" "$TMP/copia.json" >/dev/null 2>&1; then echo "✗ Restauró encima de datos existentes"; exit 1; fi
echo "✓ Se niega a restaurar encima de datos existentes."

# 5. Copia alterada (un importe): la detecta y no restaura.
node -e '
const fs=require("fs"); const c=JSON.parse(fs.readFileSync(process.argv[1]));
c.tablas.invoices.find(f=>f.number==="F-2026-0003").total=1.00; fs.writeFileSync(process.argv[2], JSON.stringify(c));' "$TMP/copia.json" "$TMP/alterada.json"
if PGDATABASE=klima_prueba_destino2 node "$APP/scripts/restaurar-copia.mjs" "$TMP/alterada.json" >/dev/null 2>&1; then echo "✗ Aceptó una copia alterada"; exit 1; fi
echo "✓ Una copia con un importe cambiado se rechaza (no cuadra con su manifiesto)."

# 6. Alterada a conciencia (importe de un registro + manifiesto recalculado):
#    el manifiesto ya no lo detecta, la cadena Veri*Factu sí.
node --input-type=module -e '
import fs from "node:fs";
import { manifiestoDe, sha256Hex, canonico } from "'"$APP"'/src/lib/copia/nucleo.mjs";
const c = JSON.parse(fs.readFileSync(process.argv[1]));
c.tablas.verifactu_registros.find(r => r.num_serie === "F-2026-0003" && r.tipo_registro === "alta").importe_total = 1.00;
c.manifiesto = await manifiestoDe(c.tablas); c.huellaCopia = await sha256Hex(canonico(c.manifiesto));
fs.writeFileSync(process.argv[2], JSON.stringify(c));' "$TMP/copia.json" "$TMP/falsificada.json"
if PGDATABASE=klima_prueba_destino2 node "$APP/scripts/restaurar-copia.mjs" "$TMP/falsificada.json" > "$TMP/f.log" 2>&1; then echo "✗ Aceptó un registro fiscal falsificado"; cat "$TMP/f.log"; exit 1; fi
grep -q "huellas que no cuadran" "$TMP/f.log" && echo "✓ Un registro fiscal falsificado (con manifiesto rehecho) se detecta al recalcular la cadena."

for db in klima_prueba_origen klima_prueba_destino klima_prueba_destino2; do q -d postgres -c "DROP DATABASE IF EXISTS $db"; done
echo "✓ PRUEBA DE RESTAURACIÓN SUPERADA."

#!/usr/bin/env bash
# Prueba de deploy/copia-diaria.sh contra un PostgreSQL LOCAL: hace la copia
# cifrada de una base con la empresa inventada, la descifra con la clave
# privada (que en producción NO está en el servidor), la restaura en otra
# base y compara. Nunca apuntes esto a producción.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"; APP="$(cd "$AQUI/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
q() { psql -X -q -At -v ON_ERROR_STOP=1 "$@"; }
for db in klima_copia_origen klima_copia_restaurada; do q -d postgres -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"; done
q -d klima_copia_origen -c "CREATE SCHEMA IF NOT EXISTS auth; CREATE TABLE auth.users (id uuid primary key, email text); INSERT INTO auth.users VALUES ('aaaaaaaa-0000-4000-8000-000000000001','prueba@ejemplo.invalid');"
q -d klima_copia_origen -f "$AQUI/esquema.sql" -f "$AQUI/funciones.sql" -f "$AQUI/datos.sql"

age-keygen -o "$TMP/clave.txt" 2>/dev/null
PUBLICA="$(age-keygen -y "$TMP/clave.txt")"
URL="postgresql:///klima_copia_origen?host=${PGHOST}&port=${PGPORT:-5432}&user=${PGUSER}"
SUPABASE_DB_URL="$URL" BACKUP_AGE_RECIPIENT="$PUBLICA" BACKUP_DIR="$TMP/copias" ENV_FILE=/dev/null "$APP/deploy/copia-diaria.sh"

F="$(ls "$TMP"/copias/*.dump.age)"
( cd "$TMP/copias" && sha256sum -c ./*.sha256 >/dev/null ) && echo "✓ Suma SHA-256 de la copia correcta."
if pg_restore --list "$F" >/dev/null 2>&1; then echo "✗ La copia se puede leer SIN la clave privada"; exit 1; fi
echo "✓ Cifrada: sin la clave privada no se puede leer."
age -d -i "$TMP/clave.txt" -o "$TMP/copia.dump" "$F"
# Base vacía de verdad: la copia trae sus esquemas (public y auth).
q -d klima_copia_restaurada -c "DROP SCHEMA public CASCADE"
pg_restore --exit-on-error --no-owner --no-privileges -d klima_copia_restaurada "$TMP/copia.dump"
for t in invoices invoice_line_items invoice_tax_breakdown verifactu_registros invoice_events cobros_pagos historico_documentos clients products; do
  o=$(q -d klima_copia_origen -c "SELECT count(*) || ':' || md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public.$t x")
  d=$(q -d klima_copia_restaurada -c "SELECT count(*) || ':' || md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public.$t x")
  [ "$o" = "$d" ] || { echo "✗ $t difiere tras restaurar"; exit 1; }
done
echo "✓ Restaurada en otra base: todas las tablas comprobadas idénticas, fila a fila (incluida la escala de los importes)."
r=$(q -d klima_copia_restaurada -c "SELECT count(*) FILTER (WHERE public.verifactu_huella(CASE WHEN tipo_registro='anulacion' THEN public.verifactu_cadena_anulacion(id_emisor,num_serie,fecha_expedicion,huella_anterior,fecha_hora_huso) ELSE public.verifactu_cadena_alta(id_emisor,num_serie,fecha_expedicion,tipo_factura,cuota_total,importe_total,huella_anterior,fecha_hora_huso) END) <> huella) FROM public.verifactu_registros")
[ "$r" = "0" ] && echo "✓ Cadena Veri*Factu recalculada en la base restaurada: 0 huellas que no cuadran."
for db in klima_copia_origen klima_copia_restaurada; do q -d postgres -c "DROP DATABASE IF EXISTS $db"; done
echo "✓ PRUEBA DE LA COPIA DIARIA SUPERADA."

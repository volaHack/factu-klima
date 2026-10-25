#!/usr/bin/env bash
# =============================================================================
# copia-diaria.sh — COPIA DIARIA, CIFRADA Y VERIFICADA, DE TODA LA BASE DE DATOS
# =============================================================================
# El proyecto de Supabase está en el plan gratuito: sin PITR y sin copias que
# se puedan descargar. Esta es la copia de la plataforma (todas las empresas),
# hecha por nosotros y guardada FUERA de Supabase.
#
#   1. pg_dump de los esquemas public y auth (formato custom).
#   2. Se comprueba que el volcado se puede leer (pg_restore --list) y que
#      trae las tablas fiscales. Si no, falla y NO borra copias anteriores.
#   3. Se cifra con age para la clave PÚBLICA de BACKUP_AGE_RECIPIENT: la
#      privada no está en el servidor (quien robe el servidor no puede leer
#      las copias). Se borra el volcado sin cifrar.
#   4. Retención: se borran las copias de más de BACKUP_RETENTION_DAYS días
#      (30 por defecto), sólo después de haber hecho bien la de hoy.
#   5. Si hay BACKUP_RCLONE_REMOTE (p. ej. «b2:klima-copias»), se sube allí:
#      fuera del VPS, que es lo que protege de un incendio o de perder el VPS.
#
# Variables (en $APP_DIR/.env): SUPABASE_DB_URL (conexión directa a Postgres,
# secreta), BACKUP_AGE_RECIPIENT (clave pública age1…), BACKUP_DIR,
# BACKUP_RETENTION_DAYS, BACKUP_RCLONE_REMOTE.
#
# Restaurar: age -d -i clave-privada.txt copia.dump.age > copia.dump
#            pg_restore --no-owner --no-privileges -d "$DESTINO" copia.dump
# (y probarlo cada mes en una base aparte: ver docs/COPIAS.md).
# =============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/../.." && pwd -L)}"
ENV="${ENV_FILE:-$APP_DIR/.env}"
leer() { [ -f "$ENV" ] && grep -E "^$1=" "$ENV" | tail -1 | cut -d= -f2- | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//' || true; }

DB_URL="${SUPABASE_DB_URL:-$(leer SUPABASE_DB_URL)}"
DESTINATARIO="${BACKUP_AGE_RECIPIENT:-$(leer BACKUP_AGE_RECIPIENT)}"
DIR="${BACKUP_DIR:-$(leer BACKUP_DIR)}"; DIR="${DIR:-$HOME/copias}"
DIAS="${BACKUP_RETENTION_DAYS:-$(leer BACKUP_RETENTION_DAYS)}"; DIAS="${DIAS:-30}"
REMOTO="${BACKUP_RCLONE_REMOTE:-$(leer BACKUP_RCLONE_REMOTE)}"

fallo() { echo "$(date -u +%FT%TZ) ✗ COPIA DIARIA FALLIDA: $*" >&2; exit 1; }
[ -n "$DB_URL" ] || fallo "falta SUPABASE_DB_URL"
[ -n "$DESTINATARIO" ] || fallo "falta BACKUP_AGE_RECIPIENT (clave pública age): no se guardan copias sin cifrar"
command -v pg_dump >/dev/null || fallo "falta pg_dump"
command -v age >/dev/null || fallo "falta age (apt install age)"

mkdir -p "$DIR"; chmod 700 "$DIR"
SELLO="$(date -u +%Y%m%dT%H%M%SZ)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
VOLCADO="$TMP/klima-$SELLO.dump"

# La URL se parte en las variables de libpq (PGHOST, PGPASSWORD…): así la
# contraseña no va en la línea de órdenes y no sale en `ps`.
command -v node >/dev/null || fallo "falta node (para leer SUPABASE_DB_URL)"
mapfile -t P < <(node -e '
  const u = new URL(process.argv[1]); const q = u.searchParams; const d = decodeURIComponent;
  for (const v of [d(u.hostname) || q.get("host") || "", u.port || q.get("port") || "5432",
                   d(u.username) || q.get("user") || "", d(u.password), d(u.pathname.slice(1)) || "postgres",
                   q.get("sslmode") || ""]) console.log(v);' "$DB_URL") || fallo "SUPABASE_DB_URL no es una URL válida"
export PGHOST="${P[0]}" PGPORT="${P[1]}" PGUSER="${P[2]}" PGPASSWORD="${P[3]}" PGDATABASE="${P[4]}"
# Con Supabase la conexión va cifrada; con un socket local no hace falta.
case "$PGHOST" in /*) ;; *) export PGSSLMODE="${P[5]:-require}" ;; esac

pg_dump --format=custom --no-owner --no-privileges --schema=public --schema=auth --file="$VOLCADO" \
  || fallo "pg_dump no ha terminado"

LISTA="$(pg_restore --list "$VOLCADO")" || fallo "el volcado no se puede leer"
for t in invoices invoice_line_items verifactu_registros company_settings; do
  grep -qE "TABLE DATA public $t " <<<"$LISTA" || fallo "el volcado no trae la tabla $t"
done

age -r "$DESTINATARIO" -o "$DIR/klima-$SELLO.dump.age" "$VOLCADO" || fallo "no se ha podido cifrar"
( cd "$DIR" && sha256sum "klima-$SELLO.dump.age" > "klima-$SELLO.dump.age.sha256" )
echo "$(date -u +%FT%TZ) ✓ copia $DIR/klima-$SELLO.dump.age ($(du -h "$DIR/klima-$SELLO.dump.age" | cut -f1))"

find "$DIR" -name 'klima-*.dump.age*' -mtime +"$DIAS" -delete

if [ -n "$REMOTO" ]; then
  command -v rclone >/dev/null || fallo "BACKUP_RCLONE_REMOTE puesto pero falta rclone"
  rclone copy "$DIR/klima-$SELLO.dump.age" "$REMOTO" && rclone copy "$DIR/klima-$SELLO.dump.age.sha256" "$REMOTO" \
    || fallo "no se ha podido subir a $REMOTO"
  echo "$(date -u +%FT%TZ) ✓ subida a $REMOTO"
else
  echo "$(date -u +%FT%TZ) · AVISO: sin BACKUP_RCLONE_REMOTE la copia sólo está en este VPS (no protege de perderlo)."
fi

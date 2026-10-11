#!/usr/bin/env bash
# =============================================================================
# cron.sh — Lanza una tarea programada de la app en el VPS
# =============================================================================
# Es lo que en Vercel hacen los «crons» de vercel.json. Lo llama el crontab
# que pone deploy/activar.sh:
#
#   $APP_DIR/current/deploy/cron.sh banco|verifactu|recordatorios|correos
#
# Llama a la app por dentro (127.0.0.1, sin pasar por nginx) con el
# CRON_SECRET del .env, y deja la respuesta en ~/logs/cron.log.
# =============================================================================

set -euo pipefail

TAREA="${1:?Falta la tarea}"
case "$TAREA" in banco|verifactu|recordatorios|correos) ;; *) echo "Tarea desconocida: $TAREA" >&2; exit 2 ;; esac

# $APP_DIR/current/deploy/cron.sh → $APP_DIR (sin resolver el enlace current).
APP_DIR="$(cd "$(dirname "$0")/../.." && pwd -L)"
ENV="$APP_DIR/.env"

leer() { grep -E "^$1=" "$ENV" | tail -1 | cut -d= -f2- | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//' || true; }
SECRETO="$(leer CRON_SECRET)"
PUERTO="$(leer PORT)"
PUERTO="${PUERTO:-3000}"
[ -n "$SECRETO" ] || { echo "Falta CRON_SECRET en $ENV" >&2; exit 1; }

mkdir -p "$HOME/logs"
{
  printf '%s %s: ' "$(date -u +%FT%TZ)" "$TAREA"
  # La cabecera va por un descriptor, no en la línea de órdenes: así el
  # secreto no aparece en `ps`.
  curl -sS --max-time 300 -H @<(printf 'Authorization: Bearer %s\n' "$SECRETO") \
    "http://127.0.0.1:$PUERTO/api/cron/$TAREA" || true
  echo
} >> "$HOME/logs/cron.log" 2>&1

#!/usr/bin/env bash
# =============================================================================
# activar.sh — Pone en marcha en el VPS una versión ya subida
# =============================================================================
# Lo ejecuta el despliegue de GitHub Actions por SSH, después de subir la
# versión a  $APP_DIR/releases/<versión>/ :
#
#   bash $APP_DIR/releases/<versión>/deploy/activar.sh $APP_DIR <versión> [on|off]
#
# Qué hace:
#   1. Apunta  $APP_DIR/current  a la versión nueva (cambio atómico).
#   2. Reinicia la app con PM2 (o la arranca si no estaba).
#   3. Comprueba que responde. Si no, vuelve a la versión anterior y falla,
#      para que el despliegue salga en rojo en GitHub.
#   4. Deja sólo las 5 últimas versiones.
#   5. Pone o quita las tareas diarias en el crontab (tercer argumento).
#
# El .env de producción vive en  $APP_DIR/.env  y no se toca nunca.
# =============================================================================

set -euo pipefail

APP_DIR="${1:?Falta la carpeta de la app}"
VERSION="${2:?Falta la versión}"
CRON="${3:-off}"
NOMBRE="facturacion-app"
NUEVA="$APP_DIR/releases/$VERSION"
export APP_DIR

[ -f "$NUEVA/server.js" ] || { echo "✗ No está $NUEVA/server.js"; exit 1; }
[ -f "$APP_DIR/.env" ] || { echo "✗ Falta $APP_DIR/.env con las variables de producción"; exit 1; }
command -v pm2 >/dev/null || { echo "✗ PM2 no está instalado (npm install -g pm2)"; exit 1; }
mkdir -p "$HOME/logs"

# Puerto: el del .env si lo trae; si no, 3000 (el de nginx).
PUERTO="$(grep -E '^PORT=' "$APP_DIR/.env" | tail -1 | cut -d= -f2- | tr -d '"'"'"' ' || true)"
PUERTO="${PUERTO:-3000}"

ANTERIOR="$(readlink -f "$APP_DIR/current" 2>/dev/null || true)"

apuntar() {
  ln -sfn "$1" "$APP_DIR/current.nuevo"
  mv -Tf "$APP_DIR/current.nuevo" "$APP_DIR/current"
}

# La ruta del server.js con el que corre ahora el proceso, si existe.
ruta_actual() {
  pm2 jlist 2>/dev/null | node -e '
    let s = ""; process.stdin.on("data", d => (s += d)).on("end", () => {
      try {
        const lista = JSON.parse(s.slice(s.indexOf("[")));
        const p = lista.find(x => x.name === process.argv[1]);
        process.stdout.write(p ? String(p.pm2_env.pm_exec_path) : "");
      } catch { process.stdout.write(""); }
    });' "$NOMBRE"
}

arrancar() {
  cd "$APP_DIR/current"
  local ruta
  ruta="$(ruta_actual)"
  if [ "$ruta" = "$APP_DIR/current/server.js" ]; then
    pm2 reload ecosystem.config.cjs --update-env
  else
    # Arrancado desde otra carpeta (o a mano): se rehace apuntando a current/.
    if [ -n "$ruta" ]; then pm2 delete "$NOMBRE" >/dev/null; fi
    pm2 start ecosystem.config.cjs
  fi
  pm2 save >/dev/null
}

responde() {
  local codigo
  for _ in $(seq 1 45); do
    codigo="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$PUERTO/login" || true)"
    case "$codigo" in 200|30[0-9]) return 0 ;; esac
    sleep 2
  done
  return 1
}

echo "→ Activando $VERSION"
apuntar "$NUEVA"
arrancar

if ! responde; then
  echo "✗ La versión nueva no responde en el puerto $PUERTO. Últimas líneas del registro:"
  pm2 logs "$NOMBRE" --nostream --lines 40 || true
  if [ -n "$ANTERIOR" ] && [ -d "$ANTERIOR" ] && [ "$ANTERIOR" != "$NUEVA" ]; then
    echo "→ Volviendo a $(basename "$ANTERIOR")"
    apuntar "$ANTERIOR"
    arrancar
    responde && echo "✓ La versión anterior vuelve a estar en marcha" || echo "✗ La anterior tampoco responde"
  fi
  exit 1
fi
echo "✓ $VERSION en marcha en el puerto $PUERTO"

# Sólo las 5 últimas versiones (nunca la activa).
ACTIVA="$(readlink -f "$APP_DIR/current")"
printf '%s\n' "$APP_DIR"/releases/*/ | sort -r | tail -n +6 | while read -r d; do
  [ "$(readlink -f "$d")" = "$ACTIVA" ] || rm -rf "$d"
done

# Tareas programadas (lo que en Vercel hace vercel.json). Se gestionan entre
# dos marcas para no tocar el resto del crontab. Veri*Factu va cada 5
# minutos: la remisión tiene que ser inmediata, no diaria; el propio envío
# respeta el tiempo de espera que pide la AEAT entre lotes.
if ! command -v crontab >/dev/null; then
  echo "· cron no está instalado en el VPS: no se programan las tareas diarias (apt install cron)"
  exit 0
fi
INICIO="# >>> facturacion-app: tareas diarias (las pone deploy/activar.sh)"
FIN="# <<< facturacion-app"
resto="$(crontab -l 2>/dev/null | awk -v i="$INICIO" -v f="$FIN" '$0==i{s=1;next} $0==f{s=0;next} !s' || true)"
if [ "$CRON" = "on" ]; then
  T="$APP_DIR/current/deploy/cron.sh"
  {
    [ -n "$resto" ] && printf '%s\n' "$resto"
    printf '%s\n' "$INICIO" \
      "CRON_TZ=UTC" \
      "40 6 * * * $T banco" \
      "*/5 * * * * $T verifactu" \
      "30 8 * * * $T recordatorios" \
      "5 7 * * * $T correos" \
      "15 3 * * * $APP_DIR/current/deploy/copia-diaria.sh >> $HOME/logs/copia.log 2>&1" \
      "$FIN"
  } | crontab -
  echo "✓ Tareas diarias programadas en el crontab"
else
  if [ -n "$resto" ]; then printf '%s\n' "$resto" | crontab -; else crontab -r 2>/dev/null || true; fi
  echo "· Tareas diarias apagadas en el VPS (variable VPS_CRON distinta de «on»)"
fi

// ecosystem.config.cjs — Configuración de PM2 en el VPS
//
// La app corre siempre desde  $APP_DIR/current , un enlace a la versión
// activa dentro de  $APP_DIR/releases/ . Al desplegar, deploy/activar.sh
// mueve el enlace y hace `pm2 reload`: el proceso vuelve a arrancar en la
// versión nueva sin cambiar esta configuración.
//
// Las variables de producción (Supabase, Stripe, Verifactu, IA, banco…)
// se leen de  $APP_DIR/.env , que el despliegue no toca nunca.

const os = require('node:os');
const path = require('node:path');

const APP_DIR = process.env.APP_DIR || '/home/deploy/facturacion-app';
const LOGS = path.join(os.homedir(), 'logs');

module.exports = {
  apps: [
    {
      name: 'facturacion-app',
      cwd: path.join(APP_DIR, 'current'),
      script: 'server.js',

      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        // Sólo en local: al público se llega por nginx (puerto 443).
        HOSTNAME: '127.0.0.1',
        APP_DIR,
      },

      // Reinicio automático ante caídas
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,

      // Registros
      error_file: path.join(LOGS, 'facturacion-error.log'),
      out_file: path.join(LOGS, 'facturacion-out.log'),
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Memoria máxima antes de reiniciar
      max_memory_restart: '512M',

      // Parada limpia
      kill_timeout: 10000,
      listen_timeout: 10000,

      // Variables del .env de producción (ruta absoluta: el cwd es un enlace)
      node_args: `--env-file=${path.join(APP_DIR, '.env')}`,
    },
  ],
};

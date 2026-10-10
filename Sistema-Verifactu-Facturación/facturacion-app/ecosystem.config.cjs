// ecosystem.config.cjs — Configuración de PM2
// Coloca este archivo en el directorio de la app en el servidor.
// PM2 lo usa para saber cómo arrancar, reiniciar y monitorizar el
// proceso de Node.js.

module.exports = {
  apps: [
    {
      name: 'facturacion-app',
      script: 'server.js',

      // Variables de entorno que Next.js standalone necesita.
      // El resto se cargan desde .env en el servidor.
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '0.0.0.0',
      },

      // Reinicio automático ante crashes
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,

      // Logs
      error_file: '/home/deploy/logs/facturacion-error.log',
      out_file: '/home/deploy/logs/facturacion-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Memoria máxima antes de reinicio automático
      max_memory_restart: '512M',

      // Señal de parada limpia
      kill_timeout: 10000,
      listen_timeout: 10000,

      // Dotenv — carga las variables del .env del servidor
      // (Supabase, Stripe, Verifactu, IA, etc.)
      node_args: '--env-file=.env',
    },
  ],
};

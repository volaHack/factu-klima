/**
 * LEVANTAR EL MODELO LOCAL DE IA ANTES DE ARRANCAR EL DEV
 *
 * Se ejecuta como parte de `predev`: comprueba si llama-server ya está
 * escuchando en el puerto 8080 y, si no, lo arranca en segundo plano.
 * Así el desarrollador no tiene que acordarse de abrir otra terminal.
 *
 * Si el modelo o el motor no existen, se avisa y se sigue adelante:
 * la app funciona sin IA (cae al fallback de Gemini si hay clave, o
 * simplemente dice que la IA no está configurada).
 */

import { existsSync } from 'fs';
import { spawn } from 'child_process';
import { createConnection } from 'net';

const MOTOR  = 'C:\\Users\\volit\\ia-local\\motor\\llama-server.exe';
const MODELO = 'C:\\Users\\volit\\ia-local\\modelos\\Qwen3-4B-Instruct-2507-Q4_K_M.gguf';
const HOST   = '127.0.0.1';
const PORT   = 8080;

/** Intenta conectar al puerto para ver si ya hay algo escuchando. */
function puertoOcupado(host, port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.setTimeout(800, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function main() {
  // Si IA_BASE_URL no apunta a localhost, no hay nada que arrancar.
  const baseUrl = process.env.IA_BASE_URL || '';
  if (baseUrl && !baseUrl.includes('127.0.0.1') && !baseUrl.includes('localhost')) {
    console.log('  ⤳ IA apunta a un servidor remoto, no se arranca nada local.');
    return;
  }

  // Si no existe el motor o el modelo, avisar y seguir.
  if (!existsSync(MOTOR)) {
    console.log(`  ⚠ No se encuentra llama-server en ${MOTOR} — la IA local no arrancará.`);
    return;
  }
  if (!existsSync(MODELO)) {
    console.log(`  ⚠ No se encuentra el modelo en ${MODELO} — la IA local no arrancará.`);
    return;
  }

  // Si ya está corriendo, no lanzar otro.
  if (await puertoOcupado(HOST, PORT)) {
    console.log(`  ✓ llama-server ya está corriendo en http://${HOST}:${PORT}`);
    return;
  }

  // Arrancar en segundo plano, desvinculado del proceso padre.
  console.log(`  🚀 Arrancando Qwen 3 4B en http://${HOST}:${PORT} ...`);
  const child = spawn(MOTOR, [
    '-m', MODELO,
    '--host', HOST,
    '--port', String(PORT),
    '--alias', 'qwen3-4b-instruct',
    '-ngl', '99',
    '-c', '8192',
    '--jinja',
  ], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });

  child.unref();
  console.log(`  ✓ llama-server lanzado en segundo plano (PID ${child.pid})`);
}

main().catch((err) => {
  console.error('  ⚠ Error arrancando IA local:', err.message);
  // No falla el dev: la app funciona sin IA.
});

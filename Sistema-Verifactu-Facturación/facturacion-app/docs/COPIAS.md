# Copias de seguridad y restauración

Hay **dos copias distintas**, para dos riesgos distintos. Ninguna depende de
Supabase: el proyecto está en el plan gratuito, sin PITR ni copias que se
puedan descargar.

## 1. Copia de la plataforma (todas las empresas) — `deploy/copia-diaria.sh`

Para: que se pierda el proyecto de Supabase, un borrado masivo, un error en
una migración.

- Cada día a las 03:15 UTC (crontab que pone `deploy/activar.sh`).
- `pg_dump` de los esquemas `public` y `auth`, en formato custom.
- Se comprueba antes de guardarla: que se puede leer y que trae las tablas
  fiscales (`invoices`, `invoice_line_items`, `verifactu_registros`,
  `company_settings`). Si falla, no borra copias anteriores y deja el error en
  `~/logs/copia.log`.
- **Cifrada con age** para una clave pública. La clave privada **no está en el
  servidor**: quien robe el VPS no puede leer las copias.
- Retención: `BACKUP_RETENTION_DAYS` (30 días por defecto) en el VPS.
- **Fuera del VPS** con `BACKUP_RCLONE_REMOTE` (Backblaze B2, S3, Google
  Drive…). Sin esto la copia está en la misma máquina que la app y no protege
  de perderla.

### Puesta en marcha (lo tiene que hacer el titular)

1. En un ordenador seguro, no en el servidor: `age-keygen -o klima-copias.key`.
   Guarda ese fichero en dos sitios offline (p. ej. un USB en la oficina y
   un gestor de contraseñas). **Sin él no se puede restaurar nada.**
2. En el `.env` del VPS:
   - `SUPABASE_DB_URL` — la conexión directa a Postgres (Supabase → Project
     Settings → Database → Connection string, *direct*).
   - `BACKUP_AGE_RECIPIENT` — la línea `age1…` que imprime `age-keygen -y klima-copias.key`.
   - `BACKUP_RCLONE_REMOTE` — el remoto de `rclone config` (p. ej. `b2:klima-copias`),
     con retención/versionado configurado en el proveedor.
3. `apt install age rclone postgresql-client` en el VPS.
4. Probar a mano: `deploy/copia-diaria.sh` y mirar `~/logs/copia.log`.

### Restaurar

```bash
age -d -i klima-copias.key -o copia.dump klima-AAAAMMDDTHHMMSSZ.dump.age
pg_restore --no-owner --no-privileges -d "$DESTINO" copia.dump
```

Probado en aislado con `scripts/prueba-restauracion/probar-copia-diaria.sh`:
la copia no se puede leer sin la clave privada, y restaurada en otra base todas
las tablas salen idénticas fila a fila y la cadena Veri*Factu vuelve a cuadrar.

**Simulacro mensual:** restaurar la última copia en una base aparte (nunca en
producción) y pasarle `probar-copia-diaria.sh`/las comprobaciones de cadena.
Una copia que no se ha probado a restaurar no cuenta como copia.

## 2. Copia de una empresa — Ajustes → «Descargar todos mis datos»

Para: que el cliente tenga sus datos (obligación de conservarlos), cambiar de
programa, o recuperar una empresa concreta.

- Se lee del **servidor** (`/api/copia`), no de la caché del equipo.
- Lleva las 43 tablas de la empresa: facturas, líneas, desgloses, **registros
  Veri*Factu con sus huellas**, eventos, cobros, albaranes, histórico…
- **Manifiesto**: filas y SHA-256 de cada tabla, y una huella de la copia.
- **No lleva credenciales**: certificado electrónico, conexiones con banco y
  Stripe, PIN de perfiles (se dice dentro de la propia copia).
- Al generarla se verifica: manifiesto, cadena Veri*Factu recalculada con el
  algoritmo de la AEAT y cada factura emitida con su registro.

### Restaurar

```bash
PGHOST=… PGUSER=… PGPASSWORD=… PGDATABASE=… node scripts/restaurar-copia.mjs copia.json
node scripts/restaurar-copia.mjs copia.json --comprobar   # sólo comprueba
```

Comprueba el manifiesto, **se niega a restaurar encima** de datos de esa cuenta,
carga todo en una transacción con los triggers en pausa (para que el sellado no
recalcule huellas), vuelve a leer lo restaurado y exige el mismo manifiesto, y
recalcula la cadena con las funciones Veri*Factu del destino.

Probado en aislado con `scripts/prueba-restauracion/probar.sh` (empresa
inventada): restauración idéntica, otra empresa de la misma base no se cuela en
la copia, una copia con un importe cambiado se rechaza y un registro fiscal
falsificado con el manifiesto rehecho se detecta al recalcular la cadena.

### Limitaciones conocidas (honestas)

- **Escala de los importes**: el JSON no distingue `100.00` de `100`; las
  columnas son `numeric` sin escala fija, así que vuelven como `100`. Mismo
  valor (Postgres las da por iguales y la huella, que redondea a 2 decimales,
  no cambia). La copia de plataforma (`pg_dump`) sí conserva la escala.
- La restauración por empresa necesita un rol que pueda poner
  `session_replication_role = replica` (superusuario en un Postgres propio).
  **Sin probar todavía contra un proyecto de Supabase real.**
- El usuario de `auth.users` no va en la copia por empresa: en un proyecto
  nuevo hay que crear antes la cuenta con el mismo `user_id` (o restaurar la
  copia de plataforma, que sí lleva `auth`).

# Banco conectado para todas las empresas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cualquier empresa conecte sus bancos (PSD2, Enable Banking), vea saldos y movimientos dentro de la app, que los movimientos lleguen solos cada día y queden listos para conciliar con sus facturas.

**Architecture:** El cliente de Enable Banking ya existe (`src/lib/banco/enableBanking.ts`) pero en producción no hay credenciales, así que nadie ha podido conectar nunca un banco (0 filas en `bancos_conectados`). Se añade: un diagnóstico de la configuración para el administrador, movimientos guardados en base de datos (`banco_movimientos`), un motor de sincronización servidor que usa el cron diario y el botón «Sincronizar», la renovación del permiso sin duplicar, y una pantalla `/banco`. La conciliación deja de depender de un extracto en `localStorage` y lee lo guardado.

**Tech Stack:** Next.js 16 (route handlers, `after`), Supabase (service role en servidor, RLS sin políticas), Vitest, Playwright contra un Enable Banking simulado.

**Spec:** petición de la usuaria (9-oct-2026): «que se pueda conectar con el banco el sistema de facturación para que toda empresa pueda manejar el banco con la app… necesito que esto sea exitoso».

## Global Constraints

- Cada empresa es un usuario de Supabase: todo se filtra por `user_id`; ninguna consulta de banco sale del servidor sin ese filtro.
- `session_id` de Enable Banking nunca llega al navegador.
- PSD2: sin el usuario delante, como mucho 4 lecturas al día por cuenta → el cron lee una vez al día.
- Sólo movimientos `BOOK` y en EUR (ya lo hace `movimientosDesdeBanco`).
- Ids de movimiento estables entre sesiones (`eb` + huella de IBAN + referencia): renovar el permiso no duplica.
- Textos de interfaz en español, en el tono del resto de la app.
- No se envía nada real a ningún banco desde este entorno: las pruebas usan `ENABLE_BANKING_API_URL` apuntando a un servidor simulado.

## Review Focus

1. Permiso caducado o revocado en el banco → la conexión queda «caducada», se avisa y se ofrece «Renovar», sin errores sueltos.
2. Reconectar el mismo banco → actualiza la conexión existente, no crea otra ni duplica movimientos.
3. Redirect URL no registrada en Enable Banking (causa nº 1 de fallo al empezar) → el diagnóstico lo dice con la URL exacta que hay que añadir.
4. Clave privada pegada sin saltos de línea o con `\n` literales → se normaliza o el diagnóstico lo explica.
5. Un movimiento ya conciliado o ignorado no vuelve a aparecer como pendiente en otro dispositivo.

---

### Task 1: Configuración y diagnóstico

**Files:** Modify `src/lib/banco/enableBanking.ts`; Create `src/lib/banco/diagnostico.ts`, `src/lib/banco/diagnostico.test.ts`, `src/app/api/admin/banco/route.ts`, `src/app/(app)/admin/banco/page.tsx`; Modify `src/components/admin/AdminNavBar.tsx`.

**Interfaces — Produces:**
- `urlApi(): string` (env `ENABLE_BANKING_API_URL` o `https://api.enablebanking.com`).
- `normalizarClave(pem: string): string`.
- `aplicacion(): Promise<AplicacionEnableBanking>` → `{ nombre, entorno: 'SANDBOX'|'PRODUCTION'|string, redirecciones: string[], activa: boolean }`.
- `diagnosticar(e: EntradaDiagnostico): Comprobacion[]` con `Comprobacion = { id, ok: boolean, titulo, detalle, arreglo? }`.

- [ ] Tests: falta app id / falta clave / clave ilegible / app no activa / redirect no registrada (con la URL exacta) / todo bien.
- [ ] Implementar y pasar tests; página de admin con las comprobaciones y la guía paso a paso.

### Task 2: Movimientos guardados (migración 062)

**Files:** Create `supabase/migration_062_banco_movimientos.sql`.

- `banco_movimientos(id text, user_id uuid, conexion_id uuid, cuenta_uid text, iban text, fecha date, importe numeric(14,2), concepto text, referencia text, saldo numeric, ignorado boolean default false, creado_en timestamptz)`, PK `(user_id, id)`, índice `(user_id, fecha desc)`, RLS sin políticas.
- `bancos_conectados`: `estado text default 'activa'`, `saldos jsonb`, `ultimo_error text`.

### Task 3: Motor de sincronización

**Files:** Create `src/lib/banco/sincronia.ts` (puro) + test, `src/lib/banco/sincronizar.ts` (servidor); Modify `enableBanking.ts` (`saldos(uid)`, `ErrorEnableBanking` con `estado`).

**Interfaces — Produces:**
- `desdeParaSincronizar(ultima: string | null, hoy: string): string` (primera vez 90 días; después, última − 5 días).
- `saldoPrincipal(balances): { importe: number; fecha: string | null; tipo: string } | null` (preferencia ITAV > CLAV > XPCD > CLBD > ITBD > el primero).
- `esPermisoCaducado(error: unknown): boolean` (401/403, `EXPIRED`, `REVOKED`, `INVALID_SESSION`).
- `sincronizarConexion(db, conexion): Promise<ResultadoSincronia>` → `{ nuevos, cuentas, caducada, error? }`.

### Task 4: API y cron

- `GET /api/banco` → conexiones con saldos, estado y recuento de movimientos sin conciliar.
- `POST /api/banco/sincronizar { conexionId? }` (límite 6/hora).
- `GET /api/banco/movimientos?desde&cuenta` desde la base de datos; `PATCH` para ignorar/recuperar.
- `GET /api/cron/banco` (CRON_SECRET) + `vercel.json` a las 06:40.

### Task 5: Renovar sin duplicar

- `vuelta`: si ya hay una conexión del mismo banco con algún IBAN en común → se actualiza (sesión nueva, cuentas, caducidad, estado activa) y se borra la sesión vieja en Enable Banking; si no, se crea. Después, primera sincronización con `after()`.

### Task 6: Pantalla `/banco`

- Cuentas con saldo, última lectura, caducidad («Renovar» si quedan ≤ 10 días o ya caducó), «Sincronizar ahora», «Desconectar», conectar otro banco.
- Movimientos guardados con buscador y filtro (todos / sin conciliar / conciliados), «Conciliar» lleva a `/conciliacion`.
- Entrada en el menú lateral junto a Tesorería.
- Conciliación: si hay banco conectado, carga los movimientos guardados sola; ignorar se guarda en el servidor.

### Task 7: Para hoy

- Tareas: «El permiso de {banco} caduca en N días» (≤ 10) o «ha caducado», y «N movimientos del banco sin conciliar».

### Task 8: Prueba de extremo a extremo

- Servidor Enable Banking simulado (`/application`, `/aspsps`, `/auth`, `/sessions`, `/accounts/:id/transactions`, `/accounts/:id/balances`) y página de banco simulada que devuelve a `/api/banco/vuelta?code&state`.
- Playwright: conectar → volver → saldos y movimientos en `/banco` → aparecen en `/conciliacion` → sincronizar otra vez no duplica → renovar no crea otra conexión.
- tsc, eslint, vitest, build; PR; merge con CI verde.

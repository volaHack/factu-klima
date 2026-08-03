# Hoja de ruta de mejoras — facturacion-app (2026-08-03)

## Origen

Auditoría en paralelo de 4 agentes Claude (solo lectura) sobre el estado real del código, contrastado contra la documentación del repo (que en varios puntos afirma "✅ COMPLETADO" cuando el código dice lo contrario). Áreas: frontend/UX, funcionalidad core/Verifactu, arquitectura/backend/datos, calidad/producción.

Gate acordado con el usuario: esta hoja de ruta requiere aprobación explícita antes de que ningún agente implemente nada.

## Tier 0 — Riesgos de seguridad activos (antes que cualquier otra cosa)

1. **Tablas `order_approvals`, `order_approval_items`, `user_profiles` sin migración en el repo.** Usadas en producción (`storage.ts`, `stripe/checkout/route.ts`) desde una página pública sin sesión (`/aprobar/[token]`) con el cliente anónimo de Supabase. Sin el SQL en el repo no se puede auditar qué RLS tienen realmente en producción. Confirmado por dos agentes de forma independiente. **Intenté verificar el estado real de RLS vía MCP de Supabase y no hay token de acceso configurado en esta sesión — no puedo confirmar ni descartar que sea explotable ahora mismo.** Acción recomendada inmediata (independiente del resto del plan): revisar manualmente en el dashboard de Supabase (Authentication → Policies) si esas tablas tienen RLS activo, mientras se prepara la migración formal.
2. **FKs entre tenants sin verificación de propiedad** (`invoices.client_id`, `invoice_line_items.product_id`): la RLS solo comprueba el dueño de la factura, no que el cliente/producto referenciado pertenezca al mismo usuario.
3. **Redirección abierta en `/auth/callback`** (`next` sin whitelist de rutas internas).
4. **Sin rate limiting** en `/aprobar/[token]`, `/api/stripe/checkout`, `/api/verifactu/certificate/upload`.
5. **Sin cabeceras de seguridad HTTP** (CSP, X-Frame-Options) — relevante porque `/aprobar/[token]` es pública y embebible en iframe.
6. **IndexedDB no se limpia al hacer logout** — fuga de datos entre empresas en dispositivo compartido.

## Tier 1 — El núcleo del producto: que Verifactu sea real, no una demo

Confirmado por el agente de funcionalidad: **no existe ningún cliente AEAT en el repo**. La capa antifraude interna (hash encadenado, inmutabilidad) es sólida, pero:
- No hay generación del "registro de facturación" oficial ni firma XAdES ni envío SOAP/REST a AEAT.
- La validación de certificado FNMT es un mock declarado (`mockValidateCertificateServer`) — acepta cualquier BASE64 con contraseña no vacía.
- No se genera el QR normalizado obligatorio.
- El hash interno no sigue el formato exacto de la Orden HAC/1177/2024.
- El endpoint de AEAT usado en el health-check (`https://www.aeat.es/verifactu/api/v1/health`) parece inventado, no corresponde a documentación oficial conocida.
- La tabla `verifactu_submissions` existe en el esquema pero ningún código la usa.

**Esto es la decisión más importante de toda la hoja de ruta** — ver pregunta al usuario abajo antes de planificar el detalle.

## Tier 2 — Robustez de arquitectura y datos

- Sync engine offline sin resolución de conflictos (last-write-wins silencioso).
- Migraciones no versionadas con CLI de Supabase (solo scripts sueltos "pegar en el SQL Editor"), con drift ya detectado (Tier 0.1).
- Validación de variables de entorno sin fail-fast centralizado.
- Clave de cifrado de certificados sin rotación/KMS (aceptable para MVP, anotar para más adelante).
- Modelo 1 usuario = 1 empresa sin soporte de equipos (limitación de diseño, no bug).
- Código muerto: `src/lib/supabase/proxy.ts` duplica `src/proxy.ts`.

## Tier 3 — Calidad y preparación para producción

- Cero tests en todo el repo (playwright está instalado pero sin usar).
- Cero observabilidad (solo `console.error` disperso, sin Sentry/similar, sin `error.tsx`/`global-error.tsx`).
- Sin validación de payloads con zod/yup en las API routes.
- Sin code-splitting (`next/dynamic`) para `recharts`; dos usos de `<img>` nativo en vez de `next/image`.

## Tier 4 — Frontend / UX / visual

1. `window.confirm()` nativo en las 5 acciones destructivas de la app, en vez del sistema `.modal` ya existente — Alto impacto, Bajo esfuerzo.
2. Command Palette (Ctrl+K) inutilizable por teclado (sin Escape, sin flechas, resultados sin foco) — bug real, no solo pulido.
3. Página pública `/aprobar/[token]` ignora el `AccentTheme` configurado por el negocio — la página que ven los clientes externos no refleja su marca.
4. Semántica de diálogo inconsistente entre modales (solo `FirstStepsModal` tiene `role="dialog"`/`aria-modal`).
5. Ausencia total de modo claro (decisión de diseño posible, pero sin alternativa).
6. `TableEmpty` no reutilizado en `informes/page.tsx` (única grieta en un patrón por lo demás consistente).
7. Buscador del Header inaccesible por teclado sin pasar por Ctrl+K.

## Decisión pendiente del usuario antes de planificar la implementación

**Alcance de Tier 1 (Verifactu real):** construir un cliente AEAT genuino requiere la especificación técnica oficial real (WSDL/XSD del registro de facturación, endpoints de preproducción/producción, formato exacto de la Orden HAC/1177/2024) — investigada activamente, no asumida, porque ya hay un precedente en este repo de un endpoint de AEAT inventado. Dos caminos:
- **(A) Investigar la especificación oficial y construir hacia el cumplimiento real** — esfuerzo alto, varias sesiones, y probablemente necesite que el usuario aporte acceso a un certificado FNMT de pruebas y/o al entorno de preproducción de AEAT para validar.
- **(B) Dejar el Tier 1 explícitamente etiquetado como modo local/simulado por ahora**, invertir este ciclo en Tier 0 (seguridad) + Tier 2/3/4 (robustez, calidad, UX), y abordar la integración AEAT real en un ciclo dedicado posterior.

## Decisión del usuario (2026-08-03)

- **Tier 1**: opción (A) — investigar la especificación oficial de Verifactu/AEAT y construir hacia el cumplimiento real. Requiere fase de investigación dedicada antes de escribir código (no asumir formatos/endpoints).
- **Cadencia de ejecución**: avanzar tier por tier, con revisión de código en cada cambio, avisando al usuario al completar cada tier — sin bloquear a esperar aprobación explícita en cada uno, salvo hallazgos inesperadamente grandes o arriesgados.
- **Orden de ejecución**: Tier 0 (seguridad activa) primero, luego Tier 1 (investigación + implementación Verifactu real, en paralelo con Tier 2 si no hay conflicto de archivos), luego Tier 3 y Tier 4.

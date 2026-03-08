# Diseño: Automatización de Página de Contacto

**Fecha:** 2026-03-08
**Proyecto:** Volitancrooss — Agencia de IA
**Enfoque elegido:** Cal.com API + Formulario propio + Chatbot Claude

---

## Resumen

Transformar la página de contacto de un formulario que guarda en Supabase con chatbot falso, a un sistema completamente automatizado con:
- Agendamiento real vía Cal.com API
- Disponibilidad horaria dinámica
- Chatbot IA real con Claude (Haiku)
- Emails de confirmación con Nodemailer

---

## Arquitectura

```
Cliente (browser)
    │
    ├── Formulario → /api/contact/book
    │                   ├── Cal.com API → crea booking real
    │                   ├── Nodemailer → Email de confirmación al cliente
    │                   └── Nodemailer → Notificación al equipo
    │
    ├── Selector de fecha → /api/contact/slots?date=YYYY-MM-DD
    │                           └── Cal.com API → slots disponibles reales
    │
    └── Chatbot → /api/contact/chat
                    └── Claude claude-haiku-4-5-20251001
```

---

## Variables de Entorno Requeridas

```env
# Cal.com
CAL_COM_API_KEY=          # En Cal.com > Settings > API Keys
CAL_COM_EVENT_TYPE_ID=    # ID del event type (llamada 30min)
CAL_COM_USERNAME=         # Tu username en Cal.com

# Claude API (chatbot)
ANTHROPIC_API_KEY=        # En console.anthropic.com

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu@email.com
SMTP_PASS=app-password    # Contraseña de aplicación, NO tu contraseña normal
EMAIL_FROM=tu@email.com
EMAIL_TO=tu@email.com     # Donde recibirás las notificaciones
```

---

## Setup de Cal.com (Prerrequisito)

1. Crear cuenta en cal.com
2. Conectar Google Calendar (Settings > Calendars)
3. Crear Event Type: "Consulta Inicial 30min"
   - Duración: 30 minutos
   - Configurar horario de disponibilidad (ej: Lun-Vie 9:00-18:00)
   - Activar conferencing (Google Meet automático)
4. Ir a Settings > API Keys → crear API Key
5. Anotar el Event Type ID (aparece en la URL al editarlo)

---

## Componentes

### Archivos Nuevos

| Archivo | Responsabilidad |
|---------|----------------|
| `src/app/api/contact/book/route.ts` | POST: crear booking Cal.com + enviar emails + guardar en Supabase |
| `src/app/api/contact/slots/route.ts` | GET: consultar disponibilidad por fecha en Cal.com |
| `src/app/api/contact/chat/route.ts` | POST: proxy a Claude con system prompt de Volitancrooss |

### Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `src/app/contact/page.tsx` | Fetch slots reales de Cal.com, llamar a /api/contact/book, chatbot real |
| `.env.local` | Agregar variables nuevas |

---

## API Routes — Detalles

### `/api/contact/slots` (GET)

```
Query: ?date=2026-03-15&eventTypeId=123
Response: { slots: ["09:00", "09:30", "10:00", ...] }
```

Llama a Cal.com v2 API: `GET /slots/available`

### `/api/contact/book` (POST)

```json
Body: { name, email, phone, date, time, message }
```

1. Llama `POST /bookings` en Cal.com API
2. Envía email confirmación al cliente con nodemailer
3. Envía notificación al equipo
4. Guarda en Supabase `contact_messages`
5. Devuelve `{ success: true, bookingId, meetLink }`

### `/api/contact/chat` (POST)

```json
Body: { messages: [{role, content}] }
```

System prompt incluye:
- Descripción de Volitancrooss (agencia de automatizaciones IA)
- Servicios: automatizaciones, agentes IA, desarrollo web
- Instrucciones: pre-cualificar con presupuesto y proyecto, invitar a agendar
- Responder siempre en el idioma del usuario

---

## Emails

### Confirmación al Cliente

```
Asunto: ✅ Tu consulta con Volitancrooss está confirmada
Contenido:
- Nombre del cliente
- Fecha y hora
- Link de videollamada (de Cal.com)
- Qué esperar: revisaremos tu proyecto y exploraremos cómo la IA puede ayudarte
- Contacto de emergencia
```

### Notificación al Equipo

```
Asunto: 🔔 Nueva consulta agendada — [Nombre] — [Fecha]
Contenido:
- Todos los datos del formulario
- Link directo al booking en Cal.com
```

---

## UX — Cambios en el Formulario

- **Selector de hora:** ya no es hardcoded. Al elegir una fecha, hace fetch de slots disponibles de Cal.com y los muestra. Si no hay slots, muestra mensaje.
- **Estado de carga:** skeleton mientras carga slots
- **Confirmación:** muestra el link de videollamada recibido de Cal.com
- **Chatbot:** respuestas reales de Claude en lugar de random

---

## Decisiones Técnicas

- **Cal.com v2 API** — versión más reciente, soporta `Bearer` token
- **claude-haiku-4-5-20251001** — más rápido y barato que Sonnet para chat
- **Nodemailer** — ya instalado en el proyecto, evita dependencia adicional
- **No se elimina Supabase insert** — se mantiene como backup/registro interno

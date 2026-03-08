# Contact Page Automation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:ejecutar-planes to implement this plan task-by-task.

**Goal:** Automatizar la página de contacto con Cal.com (agendamiento real), Claude (chatbot IA) y Nodemailer (emails de confirmación).

**Architecture:** El formulario existente llama a 3 nuevas API routes: `/api/contact/slots` (disponibilidad Cal.com), `/api/contact/book` (crear booking + emails + Supabase), `/api/contact/chat` (chatbot Claude). El frontend fetchea slots reales al cambiar la fecha y hace submit a `/book`.

**Tech Stack:** Next.js 16 App Router, Cal.com v2 REST API, @anthropic-ai/sdk, Nodemailer (ya instalado), Supabase (ya configurado).

---

## PRERREQUISITO: Setup de Cal.com (hacer antes de implementar)

Antes de tocar código, el usuario debe:

1. Crear cuenta en **cal.com**
2. En Settings > Calendars → conectar Google Calendar
3. Crear un Event Type:
   - Nombre: "Consulta Inicial 30min"
   - Duración: 30 minutos
   - Disponibilidad: configurar horario (ej: Lun-Vie 9:00-18:00)
   - Activar Google Meet como conferencing
4. Settings > API Keys → crear API Key → copiarla
5. Editar el Event Type → la URL tendrá el slug (ej: `consulta-30min`)
6. El Event Type ID aparece en la URL al editarlo: `cal.com/event-types/12345` → ID = `12345`

---

## PRERREQUISITO: Variables de entorno

Agregar a `.env.local`:

```env
# Cal.com
CAL_COM_API_KEY=cal_live_xxxxxxxxxxxxxxx
CAL_COM_EVENT_TYPE_ID=12345
CAL_COM_USERNAME=tu-username

# Anthropic (chatbot)
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxx

# SMTP Email (Gmail recomendado)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx
EMAIL_FROM="Volitancrooss <tu@gmail.com>"
EMAIL_TO=tu@gmail.com
```

> **Nota SMTP_PASS Gmail:** Ir a myaccount.google.com > Seguridad > Verificación en 2 pasos > Contraseñas de aplicaciones → crear una para "Mail". Usar esa contraseña de 16 caracteres.

---

## Task 1: Instalar @anthropic-ai/sdk

**Files:**
- Modify: `package.json` (via npm)

**Step 1: Instalar el paquete**

```bash
cd /c/Users/volit/Documents/volitancrooss
npm install @anthropic-ai/sdk
```

Expected output: `added 1 package` (o similar)

**Step 2: Verificar instalación**

```bash
node -e "require('@anthropic-ai/sdk'); console.log('OK')"
```

Expected: `OK`

**Step 3: Commit**

```bash
git add package.json package-lock.json bun.lock
git commit -m "chore: install @anthropic-ai/sdk for chatbot"
```

---

## Task 2: Crear route `/api/contact/slots`

Consulta disponibilidad de Cal.com por fecha y devuelve slots disponibles.

**Files:**
- Create: `src/app/api/contact/slots/route.ts`

**Step 1: Crear el directorio y archivo**

```bash
mkdir -p src/app/api/contact/slots
```

**Step 2: Escribir la route**

Crear `src/app/api/contact/slots/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date"); // YYYY-MM-DD

    if (!date) {
        return NextResponse.json({ error: "date is required" }, { status: 400 });
    }

    const apiKey = process.env.CAL_COM_API_KEY;
    const eventTypeId = process.env.CAL_COM_EVENT_TYPE_ID;

    if (!apiKey || !eventTypeId) {
        return NextResponse.json({ error: "Cal.com not configured" }, { status: 500 });
    }

    // Cal.com v2 API: get available slots
    // startTime: inicio del día, endTime: fin del día
    const startTime = `${date}T00:00:00.000Z`;
    const endTime = `${date}T23:59:59.000Z`;

    const url = `https://api.cal.com/v2/slots/available?startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}&eventTypeId=${eventTypeId}`;

    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "cal-api-version": "2024-09-04",
        },
    });

    if (!response.ok) {
        const text = await response.text();
        console.error("Cal.com slots error:", text);
        return NextResponse.json({ error: "Error fetching slots", slots: [] }, { status: 200 });
    }

    const data = await response.json();

    // Cal.com devuelve: { data: { [date]: [{ time: "2026-03-15T09:00:00.000Z" }] } }
    const dateSlots = data?.data?.[date] ?? [];
    const slots: string[] = dateSlots.map((slot: { time: string }) => {
        // Extraer solo HH:MM en hora local (el usuario ve hora de España/su zona)
        const d = new Date(slot.time);
        return d.toLocaleTimeString("es-ES", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/Madrid",
        });
    });

    return NextResponse.json({ slots });
}
```

**Step 3: Probar la route manualmente**

Con el servidor corriendo (`npm run dev`):

```bash
curl "http://localhost:3000/api/contact/slots?date=2026-03-15"
```

Expected (si Cal.com está configurado): `{"slots":["09:00","09:30","10:00"...]}`
Expected (si no está configurado aún): `{"error":"Cal.com not configured","slots":[]}`

**Step 4: Commit**

```bash
git add src/app/api/contact/slots/
git commit -m "feat: add Cal.com availability slots API route"
```

---

## Task 3: Crear route `/api/contact/chat`

Proxy al chatbot de Claude con contexto de Volitancrooss.

**Files:**
- Create: `src/app/api/contact/chat/route.ts`

**Step 1: Crear el directorio**

```bash
mkdir -p src/app/api/contact/chat
```

**Step 2: Escribir la route**

Crear `src/app/api/contact/chat/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `Eres el asistente de ventas de Volitancrooss, una agencia de automatización con Inteligencia Artificial ubicada en España.

## Sobre Volitancrooss
- Especialistas en automatizaciones con IA para empresas
- Servicios: agentes de IA, automatización de procesos, desarrollo de software a medida, chatbots inteligentes, integración de sistemas
- Clientes: empresas medianas y pequeñas que quieren ahorrar tiempo y escalar con tecnología
- Precio: proyectos desde 1.500€, con planes de mantenimiento mensual

## Tu misión
1. Entender el problema o necesidad del visitante
2. Explicar cómo Volitancrooss puede ayudarle
3. Pre-cualificar: preguntar sobre presupuesto aproximado y urgencia cuando sea natural
4. Invitar a agendar una llamada de consulta gratuita de 30 minutos usando el formulario de la página

## Reglas
- Responde SIEMPRE en el idioma que usa el visitante (español, inglés, etc.)
- Sé conversacional, cercano y profesional. No robótico.
- Respuestas cortas (2-4 frases máximo por mensaje)
- Si preguntan precios exactos, di que depende del proyecto y que en la llamada se hace un presupuesto personalizado
- NO inventar tecnologías o casos de uso que no existan
- Cuando el visitante muestre interés en avanzar, invítale a usar el formulario de la izquierda para agendar`;

export async function POST(req: NextRequest) {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
        return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json({ error: "Chatbot not configured" }, { status: 500 });
    }

    // Convertir formato del frontend al formato de Anthropic
    const anthropicMessages = messages
        .filter((m: { role: string; content: string }) => m.role === "user" || m.role === "assistant")
        .map((m: { role: string; content: string }) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
        }));

    // El primer mensaje del bot no lo enviamos (es el saludo inicial hardcoded)
    // Solo enviamos mensajes user/assistant reales
    const filteredMessages = anthropicMessages.filter(
        (m) => !(m.role === "assistant" && m.content.includes("¡Hola! 👋"))
    );

    if (filteredMessages.length === 0 || filteredMessages[filteredMessages.length - 1].role !== "user") {
        return NextResponse.json({ error: "Invalid message format" }, { status: 400 });
    }

    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: filteredMessages,
    });

    const reply = response.content[0].type === "text" ? response.content[0].text : "Lo siento, no pude procesar tu mensaje.";

    return NextResponse.json({ reply });
}
```

**Step 3: Probar la route**

```bash
curl -X POST http://localhost:3000/api/contact/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hola, quiero automatizar mi negocio"}]}'
```

Expected: `{"reply":"¡Hola! Cuéntame más sobre tu negocio..."}`

**Step 4: Commit**

```bash
git add src/app/api/contact/chat/
git commit -m "feat: add Claude AI chatbot API route"
```

---

## Task 4: Crear route `/api/contact/book`

Crea el booking en Cal.com, envía emails y guarda en Supabase.

**Files:**
- Create: `src/app/api/contact/book/route.ts`

**Step 1: Crear el directorio**

```bash
mkdir -p src/app/api/contact/book
```

**Step 2: Escribir la route**

Crear `src/app/api/contact/book/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createAdminClient } from "@/lib/supabase/server";

interface BookingRequest {
    name: string;
    email: string;
    phone: string;
    date: string;   // YYYY-MM-DD
    time: string;   // HH:MM (hora local España)
    message: string;
}

async function sendEmails(booking: BookingRequest, meetLink: string) {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    // Email de confirmación al cliente
    await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: booking.email,
        subject: `✅ Tu consulta con Volitancrooss está confirmada — ${booking.date} a las ${booking.time}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #6366f1;">¡Tu llamada está confirmada, ${booking.name}!</h2>
                <p>Nos vemos el <strong>${booking.date}</strong> a las <strong>${booking.time}</strong> (hora España).</p>
                ${meetLink ? `<p><a href="${meetLink}" style="background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin:16px 0;">Unirse a la videollamada</a></p>` : ""}
                <p>En esta llamada de 30 minutos:</p>
                <ul>
                    <li>Analizamos tu proyecto o necesidad</li>
                    <li>Exploramos cómo la IA puede ayudarte</li>
                    <li>Te presentamos opciones y presupuesto orientativo</li>
                </ul>
                <p>Si necesitas cancelar o reagendar, responde a este email.</p>
                <p style="color:#888;font-size:12px;">— El equipo de Volitancrooss</p>
            </div>
        `,
    });

    // Notificación interna
    await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: process.env.EMAIL_TO,
        subject: `🔔 Nueva consulta — ${booking.name} — ${booking.date} ${booking.time}`,
        html: `
            <div style="font-family: Arial, sans-serif;">
                <h3>Nueva consulta agendada</h3>
                <table style="border-collapse:collapse;width:100%">
                    <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Nombre</td><td style="padding:8px;border:1px solid #ddd">${booking.name}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Email</td><td style="padding:8px;border:1px solid #ddd">${booking.email}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Teléfono</td><td style="padding:8px;border:1px solid #ddd">${booking.phone}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Fecha</td><td style="padding:8px;border:1px solid #ddd">${booking.date} a las ${booking.time}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Proyecto</td><td style="padding:8px;border:1px solid #ddd">${booking.message || "Sin descripción"}</td></tr>
                    ${meetLink ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Meet</td><td style="padding:8px;border:1px solid #ddd"><a href="${meetLink}">${meetLink}</a></td></tr>` : ""}
                </table>
            </div>
        `,
    });
}

async function createCalComBooking(booking: BookingRequest): Promise<{ bookingId: string; meetLink: string }> {
    const apiKey = process.env.CAL_COM_API_KEY;
    const eventTypeId = process.env.CAL_COM_EVENT_TYPE_ID;

    // Convertir fecha + hora local (España) a UTC ISO string
    // time viene como "09:00", date como "2026-03-15"
    const [hours, minutes] = booking.time.split(":").map(Number);

    // Construir fecha en zona horaria de Madrid y convertir a UTC
    const localDateStr = `${booking.date}T${booking.time}:00`;
    // Usamos una aproximación: España en UTC+1 (invierno) o UTC+2 (verano)
    // Para mayor precisión, usar una librería de timezone, pero esto es suficiente para el MVP
    const startTime = new Date(localDateStr + "+01:00").toISOString();

    const response = await fetch("https://api.cal.com/v2/bookings", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "cal-api-version": "2024-08-13",
        },
        body: JSON.stringify({
            eventTypeId: Number(eventTypeId),
            start: startTime,
            attendee: {
                name: booking.name,
                email: booking.email,
                phoneNumber: booking.phone,
                timeZone: "Europe/Madrid",
                language: "es",
            },
            metadata: {
                project: booking.message,
            },
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        console.error("Cal.com booking error:", text);
        throw new Error("Cal.com booking failed");
    }

    const data = await response.json();
    const bookingData = data?.data ?? data;

    return {
        bookingId: String(bookingData?.id ?? bookingData?.uid ?? ""),
        meetLink: bookingData?.meetingUrl ?? bookingData?.metadata?.videoCallUrl ?? "",
    };
}

export async function POST(req: NextRequest) {
    const body: BookingRequest = await req.json();
    const { name, email, phone, date, time, message } = body;

    if (!name || !email || !phone || !date || !time) {
        return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    let bookingId = "";
    let meetLink = "";

    // 1. Crear booking en Cal.com (si está configurado)
    if (process.env.CAL_COM_API_KEY && process.env.CAL_COM_EVENT_TYPE_ID) {
        try {
            const result = await createCalComBooking(body);
            bookingId = result.bookingId;
            meetLink = result.meetLink;
        } catch (err) {
            console.error("Cal.com error:", err);
            // No bloqueamos el flujo si Cal.com falla — al menos guardamos en Supabase
        }
    }

    // 2. Guardar en Supabase
    const supabase = await createAdminClient();
    await supabase.from("contact_messages").insert({
        name: name.trim(),
        email: email.trim(),
        company: phone.trim(),
        service_interest: "Llamada IA",
        message: `[Llamada Agendada para ${date} a las ${time}${bookingId ? ` — Cal.com ID: ${bookingId}` : ""}]\nNota del cliente: ${message}`,
    });

    // 3. Enviar emails (si SMTP está configurado)
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        try {
            await sendEmails(body, meetLink);
        } catch (err) {
            console.error("Email error:", err);
            // No bloqueamos el flujo si el email falla
        }
    }

    return NextResponse.json({ success: true, bookingId, meetLink });
}
```

**Step 3: Verificar que el archivo compila**

```bash
npx tsc --noEmit 2>&1 | grep "contact/book" | head -20
```

Expected: Sin errores relacionados a este archivo.

**Step 4: Commit**

```bash
git add src/app/api/contact/book/
git commit -m "feat: add booking API route with Cal.com, Nodemailer and Supabase"
```

---

## Task 5: Actualizar `contact/page.tsx`

Conectar el formulario a los nuevos endpoints y hacer el chatbot real.

**Files:**
- Modify: `src/app/contact/page.tsx`

**Step 1: Reemplazar el archivo completo**

El archivo nuevo mantiene el diseño visual existente pero:
1. Slots son fetched de `/api/contact/slots` al cambiar la fecha
2. Submit llama a `/api/contact/book`
3. Chatbot llama a `/api/contact/chat`
4. La confirmación muestra el link de meet

Reemplazar el contenido de `src/app/contact/page.tsx` con:

```typescript
"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Loader2, PhoneCall, CheckCircle, ArrowLeft, CalendarDays, Sparkles,
    Star, ArrowRight, MessageCircle, X, Send, Bot, Zap, Shield, Clock, Video
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

export default function ContactPage() {
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [meetLink, setMeetLink] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState({
        name: "",
        email: "",
        phone: "",
        date: "",
        time: "",
        message: "",
    });

    const [slots, setSlots] = useState<string[]>([]);
    const [slotsLoading, setSlotsLoading] = useState(false);

    const [chatOpen, setChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([
        { role: "bot", content: "¡Hola! 👋 Soy el asistente de Volitancrooss. ¿En qué puedo ayudarte hoy?" }
    ]);
    const [chatInput, setChatInput] = useState("");
    const [chatLoading, setChatLoading] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Fetch slots when date changes
    useEffect(() => {
        if (!form.date) {
            setSlots([]);
            return;
        }
        setSlotsLoading(true);
        setForm(prev => ({ ...prev, time: "" }));
        fetch(`/api/contact/slots?date=${form.date}`)
            .then(r => r.json())
            .then(data => {
                setSlots(data.slots ?? []);
                setSlotsLoading(false);
            })
            .catch(() => {
                setSlots([]);
                setSlotsLoading(false);
            });
    }, [form.date]);

    // Auto-scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatMessages]);

    useEffect(() => {
        if (!chatOpen) {
            setChatMessages([
                { role: "bot", content: "¡Hola! 👋 Soy el asistente de Volitancrooss. ¿En qué puedo ayudarte hoy?" }
            ]);
        }
    }, [chatOpen]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        if (!form.date || !form.time) {
            setError("Por favor selecciona una fecha y hora para la llamada.");
            setLoading(false);
            return;
        }

        try {
            const res = await fetch("/api/contact/book", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error ?? "Error al agendar. Inténtalo de nuevo.");
                setLoading(false);
                return;
            }

            setMeetLink(data.meetLink ?? "");
            setSuccess(true);
            setLoading(false);
        } catch {
            setError("Error de conexión. Verifica tu internet e inténtalo de nuevo.");
            setLoading(false);
        }
    }

    async function handleChatSend() {
        if (!chatInput.trim() || chatLoading) return;

        const userMessage = chatInput.trim();
        setChatInput("");
        const newMessages = [...chatMessages, { role: "user", content: userMessage }];
        setChatMessages(newMessages);
        setChatLoading(true);

        try {
            const res = await fetch("/api/contact/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: newMessages }),
            });
            const data = await res.json();
            setChatMessages(prev => [...prev, { role: "bot", content: data.reply ?? "Lo siento, hubo un error." }]);
        } catch {
            setChatMessages(prev => [...prev, { role: "bot", content: "Lo siento, no pude conectarme ahora mismo." }]);
        }
        setChatLoading(false);
    }

    return (
        <div className="min-h-svh bg-background text-foreground font-sans overflow-hidden relative">
            {/* Background */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.03] via-transparent to-transparent" />
                <motion.div
                    animate={{ scale: [1, 1.1, 1], opacity: [0.4, 0.6, 0.4] }}
                    transition={{ duration: 8, repeat: Infinity }}
                    className="absolute top-0 left-1/2 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.08] blur-[120px]"
                />
                <motion.div
                    animate={{ scale: [1.1, 1, 1.1], opacity: [0.2, 0.35, 0.2] }}
                    transition={{ duration: 10, repeat: Infinity }}
                    className="absolute bottom-0 right-0 h-[400px] w-[600px] translate-x-1/4 translate-y-1/4 rounded-full bg-accent/[0.06] blur-[100px]"
                />
                <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.015)_1px,transparent_1px)] bg-[size:64px_64px]" />
            </div>

            {/* Header */}
            <header className="relative z-10 border-b border-border/50 backdrop-blur-sm">
                <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
                    <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group">
                        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
                        <span className="text-sm font-medium">Volver</span>
                    </Link>
                    <motion.div
                        animate={{ opacity: [0.6, 1, 0.6] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20"
                    >
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs text-primary font-medium">En línea</span>
                    </motion.div>
                </div>
            </header>

            <main className="relative z-10 px-6 py-8 sm:py-12">
                <div className="mx-auto max-w-7xl">
                    {success ? (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex items-center justify-center py-20"
                        >
                            <div className="text-center max-w-lg">
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                                    className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-primary/20 border-2 border-primary/40 shadow-lg shadow-primary/20"
                                >
                                    <CheckCircle className="size-12 text-primary" />
                                </motion.div>
                                <motion.h1
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4 }}
                                    className="text-4xl font-bold"
                                >
                                    <span className="bg-gradient-to-r from-foreground via-primary to-accent bg-clip-text text-transparent">
                                        ¡Cita Confirmada!
                                    </span>
                                </motion.h1>
                                <motion.p
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.5 }}
                                    className="mt-4 text-lg text-muted-foreground"
                                >
                                    Te esperamos el <span className="text-foreground font-semibold">{form.date}</span> a las <span className="text-foreground font-semibold">{form.time}</span>
                                </motion.p>
                                <motion.p
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.6 }}
                                    className="mt-2 text-sm text-muted-foreground/70"
                                >
                                    Confirmación enviada a <span className="text-foreground/80">{form.email}</span>
                                </motion.p>
                                {meetLink && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.65 }}
                                        className="mt-6"
                                    >
                                        <a
                                            href={meetLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-primary/30 bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors"
                                        >
                                            <Video className="size-4" />
                                            Unirse a la videollamada
                                        </a>
                                    </motion.div>
                                )}
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.7 }}
                                >
                                    <Button asChild className="mt-8 px-10 h-14 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-lg shadow-lg shadow-primary/20">
                                        <Link href="/">Volver al inicio</Link>
                                    </Button>
                                </motion.div>
                            </div>
                        </motion.div>
                    ) : (
                        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-start">
                            {/* Left - Content */}
                            <div className="pt-4">
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-5 py-2.5 mb-8 backdrop-blur-sm"
                                >
                                    <span className="relative flex h-1.5 w-1.5">
                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    </span>
                                    <span className="text-sm text-muted-foreground">Transforma tu visión en código</span>
                                    <Sparkles className="size-4 text-primary" />
                                </motion.div>

                                <motion.h1
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.1 }}
                                    className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1]"
                                >
                                    Haz crecer tu negocio con{" "}
                                    <span className="relative">
                                        <span className="relative z-10 text-primary">tecnología</span>
                                        <motion.span
                                            className="absolute inset-0 text-primary blur-xl opacity-40"
                                            animate={{ opacity: [0.3, 0.6, 0.3] }}
                                            transition={{ duration: 3, repeat: Infinity }}
                                        >
                                            tecnología
                                        </motion.span>
                                    </span>
                                </motion.h1>

                                <motion.p
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 }}
                                    className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-lg"
                                >
                                    No dejes que las ideas se queden en papel. Nuestro equipo de expertos hace que tu proyecto cobre vida rápidamente.
                                </motion.p>

                                <motion.div
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 }}
                                    className="flex flex-wrap items-center justify-center gap-8 sm:gap-12 mt-12 p-6 rounded-2xl border border-border bg-card/50"
                                >
                                    {[
                                        { value: "+50", label: "Automatizaciones" },
                                        { value: "+30", label: "Clientes" },
                                        { value: "100%", label: "Resolutivos" },
                                    ].map((stat, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.4 + i * 0.1 }}
                                            className="text-center"
                                        >
                                            <div className="text-3xl font-bold text-foreground sm:text-4xl">{stat.value}</div>
                                            <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
                                        </motion.div>
                                    ))}
                                </motion.div>

                                <motion.div
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.5 }}
                                    className="flex flex-wrap gap-4 mt-8"
                                >
                                    {[
                                        { icon: Zap, title: "Rápido", desc: "Entrega en tiempo récord" },
                                        { icon: Shield, title: "Seguro", desc: "Datos protegidos" },
                                        { icon: Clock, title: "24/7", desc: "Soporte continuo" },
                                    ].map((b, i) => (
                                        <motion.div
                                            key={i}
                                            whileHover={{ scale: 1.03 }}
                                            className="flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-card/50"
                                        >
                                            <b.icon className="size-4 text-primary" />
                                            <span className="text-sm font-medium">{b.title}</span>
                                            <span className="text-muted-foreground">•</span>
                                            <span className="text-sm text-muted-foreground">{b.desc}</span>
                                        </motion.div>
                                    ))}
                                </motion.div>

                                <motion.div
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.6 }}
                                    className="mt-10 p-5 rounded-2xl border border-border bg-card/50"
                                >
                                    <div className="flex items-center gap-1 mb-3">
                                        {[...Array(5)].map((_, i) => (
                                            <Star key={i} className="size-4 fill-yellow-500 text-yellow-500" />
                                        ))}
                                    </div>
                                    <p className="text-foreground/90 italic">"Transformaron nuestra idea en una aplicación en tiempo récord. El equipo es increíble."</p>
                                    <p className="text-sm text-muted-foreground mt-3">— Director de Empresa Tech</p>
                                </motion.div>
                            </div>

                            {/* Right - Form */}
                            <motion.div
                                initial={{ opacity: 0, x: 50 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.3 }}
                                className="relative"
                            >
                                <div className="absolute -inset-2 rounded-[40px] bg-gradient-to-br from-primary/20 via-primary/10 to-accent/20 blur-xl" />

                                <div className="relative rounded-3xl border border-border bg-card/95 p-6 sm:p-8 backdrop-blur-xl shadow-xl">
                                    <div className="flex items-center gap-4 mb-8">
                                        <motion.div
                                            whileHover={{ rotate: 360 }}
                                            transition={{ duration: 0.5 }}
                                            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/25"
                                        >
                                            <PhoneCall className="size-6 text-primary-foreground" />
                                        </motion.div>
                                        <div>
                                            <h2 className="text-xl font-bold">Hablemos</h2>
                                            <p className="text-sm text-muted-foreground">Agenda tu llamada de consulta</p>
                                        </div>
                                    </div>

                                    {error && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                                        >
                                            {error}
                                        </motion.div>
                                    )}

                                    <form onSubmit={handleSubmit} className="space-y-5">
                                        <div className="space-y-3">
                                            <div className="space-y-2">
                                                <Label className="text-xs text-muted-foreground font-medium ml-1">Día</Label>
                                                <div className="relative">
                                                    <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                                                    <Input
                                                        type="date"
                                                        required
                                                        min={new Date().toISOString().split("T")[0]}
                                                        value={form.date}
                                                        onChange={(e) => setForm({ ...form, date: e.target.value })}
                                                        className="h-11 pl-10 bg-background border-input focus:border-primary focus:ring-primary/20 rounded-lg text-sm"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <Label className="text-xs text-muted-foreground font-medium ml-1">Hora disponible</Label>
                                                {slotsLoading ? (
                                                    <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                                                        <Loader2 className="size-4 animate-spin" />
                                                        Cargando disponibilidad...
                                                    </div>
                                                ) : !form.date ? (
                                                    <p className="text-sm text-muted-foreground py-2">Selecciona un día para ver horarios disponibles</p>
                                                ) : slots.length === 0 ? (
                                                    <p className="text-sm text-muted-foreground py-2">No hay horarios disponibles para este día. Prueba con otra fecha.</p>
                                                ) : (
                                                    <div className="grid grid-cols-3 gap-2">
                                                        {slots.map((t) => (
                                                            <motion.button
                                                                whileHover={{ scale: 1.02 }}
                                                                whileTap={{ scale: 0.98 }}
                                                                type="button"
                                                                key={t}
                                                                onClick={() => setForm({ ...form, time: t })}
                                                                className={`h-11 rounded-lg transition-all border text-sm font-medium ${form.time === t
                                                                    ? "border-primary bg-primary/10 text-primary shadow-md shadow-primary/20"
                                                                    : "border-input bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                                                                    }`}
                                                            >
                                                                {t}
                                                            </motion.button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

                                        <div className="space-y-3">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-2">
                                                    <Label htmlFor="name" className="text-xs text-muted-foreground font-medium ml-1">Nombre</Label>
                                                    <Input
                                                        id="name"
                                                        value={form.name}
                                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                                        required
                                                        placeholder="Juan"
                                                        className="h-11 bg-background border-input focus:border-primary focus:ring-primary/20 rounded-lg text-sm"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="phone" className="text-xs text-muted-foreground font-medium ml-1">Teléfono</Label>
                                                    <Input
                                                        id="phone"
                                                        type="tel"
                                                        value={form.phone}
                                                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                                        required
                                                        placeholder="+34 600..."
                                                        className="h-11 bg-background border-input focus:border-primary focus:ring-primary/20 rounded-lg text-sm"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="email" className="text-xs text-muted-foreground font-medium ml-1">Email</Label>
                                                <Input
                                                    id="email"
                                                    type="email"
                                                    value={form.email}
                                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                                    required
                                                    placeholder="juan@empresa.com"
                                                    className="h-11 bg-background border-input focus:border-primary focus:ring-primary/20 rounded-lg text-sm"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="message" className="text-xs text-muted-foreground font-medium ml-1">Tu proyecto</Label>
                                                <Textarea
                                                    id="message"
                                                    value={form.message}
                                                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                                                    rows={3}
                                                    placeholder="Describe tu idea, objetivos, timeline..."
                                                    className="resize-none bg-background border-input focus:border-primary focus:ring-primary/20 rounded-lg text-sm"
                                                />
                                            </div>
                                        </div>

                                        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                                            <Button
                                                type="submit"
                                                disabled={loading}
                                                className="w-full h-12 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all"
                                            >
                                                {loading ? (
                                                    <span className="flex items-center gap-2">
                                                        <Loader2 className="size-5 animate-spin" />
                                                        Procesando...
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-2">
                                                        Agendar llamada
                                                        <ArrowRight className="size-4" />
                                                    </span>
                                                )}
                                            </Button>
                                        </motion.div>

                                        <p className="text-center text-xs text-muted-foreground">
                                            Sin compromiso. Confirmación por email inmediata.
                                        </p>
                                    </form>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </div>
            </main>

            {/* Chatbot floating button */}
            <motion.button
                onClick={() => setChatOpen(true)}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-xl shadow-primary/30 border-2 border-background"
            >
                <MessageCircle className="size-6 text-primary-foreground" />
                <motion.span
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white"
                >
                    !
                </motion.span>
            </motion.button>

            {/* Chat popup */}
            <AnimatePresence>
                {chatOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
                    >
                        <div className="flex items-center justify-between px-4 py-3 bg-primary">
                            <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                                    <Bot className="size-4 text-primary-foreground" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-primary-foreground">Asistente IA</p>
                                    <p className="text-[10px] text-primary-foreground/70">Powered by Claude</p>
                                </div>
                            </div>
                            <button onClick={() => setChatOpen(false)} className="text-primary-foreground/80 hover:text-primary-foreground">
                                <X className="size-5" />
                            </button>
                        </div>

                        <div className="h-72 overflow-y-auto p-4 space-y-3">
                            {chatMessages.map((msg, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                                >
                                    <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${msg.role === "user"
                                        ? "bg-primary text-primary-foreground rounded-br-md"
                                        : "bg-muted text-foreground rounded-bl-md"
                                        }`}>
                                        {msg.content}
                                    </div>
                                </motion.div>
                            ))}
                            {chatLoading && (
                                <div className="flex justify-start">
                                    <div className="px-3 py-2 rounded-2xl rounded-bl-md bg-muted">
                                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        <div className="border-t p-3">
                            <div className="flex gap-2">
                                <Input
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleChatSend()}
                                    placeholder="Escribe un mensaje..."
                                    className="h-9 bg-background border-input rounded-lg text-sm"
                                />
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={handleChatSend}
                                    disabled={chatLoading}
                                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
                                >
                                    <Send className="size-4" />
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
```

**Step 2: Verificar TypeScript**

```bash
cd /c/Users/volit/Documents/volitancrooss
npx tsc --noEmit 2>&1 | head -30
```

Expected: Sin errores (o solo warnings menores no relacionados)

**Step 3: Verificar que compila en dev**

```bash
npm run dev 2>&1 | head -20
```

Expected: `✓ Ready in Xs`

**Step 4: Commit**

```bash
git add src/app/contact/page.tsx
git commit -m "feat: connect contact form to Cal.com API, Claude chatbot and booking route"
```

---

## Task 6: Verificar integración end-to-end

**Step 1: Agregar variables de entorno**

Editar `.env.local` y agregar las variables de Cal.com, Anthropic y SMTP según el PRERREQUISITO.

**Step 2: Probar chatbot**

1. Ir a `http://localhost:3000/contact`
2. Abrir el chat flotante
3. Escribir: "Hola, quiero automatizar mi proceso de ventas"
4. Verificar que la respuesta es coherente y contextual (no aleatoria)

Expected: El bot pregunta sobre el tipo de automatización, menciona Volitancrooss.

**Step 3: Probar slots de disponibilidad**

1. Seleccionar una fecha en el formulario
2. Verificar que aparece "Cargando disponibilidad..."
3. Verificar que aparecen los slots reales de Cal.com

Expected: Slots reales del calendario (si Cal.com está configurado).
Alternativa aceptable (sin Cal.com aún): mensaje "No hay horarios disponibles para este día"

**Step 4: Probar booking completo**

1. Seleccionar fecha + hora
2. Completar nombre, email, teléfono
3. Submit
4. Verificar:
   - Pantalla de éxito con fecha/hora
   - Email de confirmación al cliente (revisar spam)
   - Email de notificación propio
   - Booking aparece en Cal.com dashboard
   - Registro en Supabase `contact_messages`

**Step 5: Commit final**

```bash
git add .env.local  # SOLO si .env.local no está en .gitignore
git commit -m "feat: contact page automation complete - Cal.com + Claude + Nodemailer"
```

> ⚠️ Asegúrate de que `.env.local` esté en `.gitignore` antes de commitear. Si no, NO lo commitees.

---

## Resumen de archivos creados/modificados

| Archivo | Estado |
|---------|--------|
| `src/app/api/contact/slots/route.ts` | NUEVO |
| `src/app/api/contact/chat/route.ts` | NUEVO |
| `src/app/api/contact/book/route.ts` | NUEVO |
| `src/app/contact/page.tsx` | MODIFICADO |
| `.env.local` | MODIFICADO (agregar variables) |
| `package.json` | MODIFICADO (@anthropic-ai/sdk) |

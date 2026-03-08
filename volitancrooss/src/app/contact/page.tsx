"use client";

import { useState, useEffect } from "react";
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

const BOT_RESPONSES = [
    "¡Genial! Cuéntame más sobre tu proyecto. ¿Qué tipo de automatización necesitas?",
    "Perfecto, podemos ayudarte con eso. ¿Tienes algún plazo específico en mente?",
    "¡Excelente idea! ¿Cuál es el mayor proceso manual que quieres eliminar?",
    "Trabajamos con empresas de todos los tamaños. ¿Qué funcionalidades son prioritarias?",
    "La IA puede transformar tu negocio. ¿Prefieres agendar una llamada para profundizar?",
];

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

    // Fetch slots reales de Cal.com al cambiar la fecha
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.date]);

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

    function handleChatSend() {
        if (!chatInput.trim() || chatLoading) return;
        const userMessage = chatInput.trim();
        setChatInput("");
        setChatMessages(prev => [...prev, { role: "user", content: userMessage }]);
        setChatLoading(true);
        setTimeout(() => {
            const reply = BOT_RESPONSES[Math.floor(Math.random() * BOT_RESPONSES.length)];
            setChatMessages(prev => [...prev, { role: "bot", content: reply }]);
            setChatLoading(false);
        }, 1200);
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
                                    Recibirás una confirmación en <span className="text-foreground/80">{form.email}</span>
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
                                                    <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
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
                                                                className={`h-11 rounded-lg transition-all border text-sm font-medium ${
                                                                    form.time === t
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
                                                        Agendando...
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
                                            Sin compromiso. Recibirás confirmación por email de Cal.com.
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
                                    <p className="text-sm font-semibold text-primary-foreground">Asistente Volitancrooss</p>
                                    <p className="text-[10px] text-primary-foreground/70">En línea ahora</p>
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
                                    <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
                                        msg.role === "user"
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

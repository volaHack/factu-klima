'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Upload, Database, RefreshCw, Plus, CheckCircle, XCircle,
    Loader2, ArrowLeft, FileText, Terminal, Zap
} from 'lucide-react';
import Link from 'next/link';

interface ActionResult {
    success: boolean;
    message?: string;
    error?: string;
    stats?: {
        inserted?: number;
        updated?: number;
        errors?: number;
    };
}

export default function AdminPage() {
    const [loading, setLoading] = useState<string | null>(null);
    const [result, setResult] = useState<ActionResult | null>(null);
    const [manualCommand, setManualCommand] = useState({
        command: '',
        description: '',
        category: 'system',
        tags: ''
    });
    const [uploadText, setUploadText] = useState('');

    const showResult = (res: ActionResult) => {
        setResult(res);
        setTimeout(() => setResult(null), 5000);
    };

    const seedDatabase = async () => {
        setLoading('seed');
        try {
            const res = await fetch('/api/seed', { method: 'POST' });
            const data = await res.json();
            showResult(data);
        } catch (err) {
            showResult({ success: false, error: 'Error de conexión' });
        }
        setLoading(null);
    };

    const syncNotebookLM = async () => {
        setLoading('sync');
        try {
            const res = await fetch('/api/notebooklm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sync' })
            });
            const data = await res.json();
            showResult(data);
        } catch (err) {
            showResult({ success: false, error: 'Error en la sincronización' });
        }
        setLoading(null);
    };

    const addManualCommand = async () => {
        if (!manualCommand.command || !manualCommand.description) {
            showResult({ success: false, error: 'Comando y descripción son obligatorios' });
            return;
        }
        setLoading('manual');
        try {
            const res = await fetch('/api/commands', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...manualCommand,
                    tags: manualCommand.tags.split(',').map(t => t.trim()).filter(Boolean),
                    examples: []
                })
            });
            const data = await res.json();
            if (data.success) {
                showResult({ success: true, message: `Comando añadido: ${manualCommand.command}` });
                setManualCommand({ command: '', description: '', category: 'system', tags: '' });
            } else {
                showResult({ success: false, error: data.error });
            }
        } catch (err) {
            showResult({ success: false, error: 'Error al añadir comando' });
        }
        setLoading(null);
    };

    const uploadDocument = async () => {
        if (!uploadText.trim()) {
            showResult({ success: false, error: 'No hay contenido para subir' });
            return;
        }
        setLoading('upload');
        try {
            const formData = new FormData();
            formData.append('content', uploadText);
            formData.append('format', uploadText.trim().startsWith('[') || uploadText.trim().startsWith('{') ? 'json' : 'text');

            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                showResult(data);
                setUploadText('');
            } else {
                showResult({ success: false, error: data.error });
            }
        } catch (err) {
            showResult({ success: false, error: 'Error en la subida' });
        }
        setLoading(null);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading('upload');
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('format', file.name.endsWith('.json') ? 'json' : 'text');

            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            showResult(data);
        } catch (err) {
            showResult({ success: false, error: 'Error al subir archivo' });
        }
        setLoading(null);
        e.target.value = '';
    };

    const categories = [
        { value: 'system', label: 'Sistema' },
        { value: 'networking', label: 'Redes' },
        { value: 'security', label: 'Seguridad' },
        { value: 'files', label: 'Archivos' },
        { value: 'process', label: 'Procesos' },
        { value: 'text', label: 'Texto' },
        { value: 'permissions', label: 'Permisos' },
        { value: 'disk', label: 'Disco' },
        { value: 'users', label: 'Usuarios' },
        { value: 'scripting', label: 'Scripting' }
    ];

    return (
        <main className="min-h-screen px-4 py-12 sm:px-6 lg:px-8 max-w-4xl mx-auto">
            {/* Cabecera */}
            <motion.div
                className="mb-10"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 text-[#64748b] hover:text-[#00ff88] transition-colors mb-6"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Volver al Buscador
                </Link>
                <h1 className="text-4xl font-bold text-white flex items-center gap-3">
                    <Database className="w-10 h-10 text-[#00ff88]" />
                    Panel de Administración
                </h1>
                <p className="text-[#94a3b8] mt-2">
                    Gestiona comandos, sincroniza desde NotebookLM y sube documentos
                </p>
            </motion.div>

            {/* Toast de Resultado */}
            <AnimatePresence>
                {result && (
                    <motion.div
                        initial={{ opacity: 0, y: -20, x: '-50%' }}
                        animate={{ opacity: 1, y: 0, x: '-50%' }}
                        exit={{ opacity: 0, y: -20, x: '-50%' }}
                        className={`fixed top-6 left-1/2 z-50 px-6 py-4 rounded-xl backdrop-blur-md border ${result.success
                            ? 'bg-[#00ff88]/10 border-[#00ff88]/30 text-[#00ff88]'
                            : 'bg-red-500/10 border-red-500/30 text-red-400'
                            }`}
                    >
                        <div className="flex items-center gap-3">
                            {result.success ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                            <span>{result.message || result.error}</span>
                            {result.stats && (
                                <span className="text-sm opacity-75">
                                    ({result.stats.inserted} nuevos, {result.stats.updated} actualizados)
                                </span>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="space-y-8">
                {/* Acciones Rápidas */}
                <motion.section
                    className="glass rounded-2xl p-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                        <Zap className="w-5 h-5 text-[#fbbf24]" />
                        Acciones Rápidas
                    </h2>

                    {/* Info de NotebookLM */}
                    <div className="mb-4 p-4 rounded-xl bg-[#a855f7]/5 border border-[#a855f7]/20">
                        <p className="text-sm text-[#94a3b8] mb-2">
                            Cuaderno de NotebookLM conectado:
                        </p>
                        <a
                            href="https://notebooklm.google.com/notebook/03df5b37-f1ea-40d5-b9c2-79a20a047a43"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#a855f7] hover:underline font-mono text-sm flex items-center gap-2"
                        >
                            <FileText className="w-4 h-4" />
                            LSearch Notebook
                            <span className="text-[#64748b]">→</span>
                        </a>
                        <p className="text-xs text-[#475569] mt-2">
                            Añade PDFs con comandos Linux a este cuaderno, luego haz clic en &quot;Sincronizar desde NotebookLM&quot;
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <button
                            onClick={seedDatabase}
                            disabled={loading !== null}
                            className="flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-[#00ff88]/10 border border-[#00ff88]/30 text-[#00ff88] font-medium hover:bg-[#00ff88]/20 transition-all disabled:opacity-50"
                        >
                            {loading === 'seed' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Database className="w-5 h-5" />}
                            Poblar BD (35 comandos)
                        </button>
                        <button
                            onClick={syncNotebookLM}
                            disabled={loading !== null}
                            className="flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-[#a855f7]/10 border border-[#a855f7]/30 text-[#a855f7] font-medium hover:bg-[#a855f7]/20 transition-all disabled:opacity-50"
                        >
                            {loading === 'sync' ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                            Sincronizar desde NotebookLM
                        </button>
                    </div>
                    <p className="text-xs text-[#475569] mt-3">
                        La sincronización consultará las fuentes de tu cuaderno y extraerá todos los comandos Linux con sus descripciones
                    </p>
                </motion.section>

                {/* Subir Documento */}
                <motion.section
                    className="glass rounded-2xl p-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                        <Upload className="w-5 h-5 text-[#00d4ff]" />
                        Subir Documento
                    </h2>
                    <p className="text-[#64748b] text-sm mb-4">
                        Sube un archivo de texto o JSON con comandos. Formato de texto: <code className="text-[#00ff88]">comando - descripción</code> (uno por línea)
                    </p>

                    <div className="space-y-4">
                        {/* Subir Archivo */}
                        <label className="flex items-center justify-center gap-3 px-6 py-8 rounded-xl border-2 border-dashed border-[#334155] hover:border-[#00d4ff]/50 cursor-pointer transition-colors">
                            <input
                                type="file"
                                accept=".txt,.json,.md"
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                            <FileText className="w-6 h-6 text-[#64748b]" />
                            <span className="text-[#94a3b8]">Arrastra archivo o haz clic para subir (.txt, .json, .md)</span>
                        </label>

                        {/* Pegar Texto */}
                        <div>
                            <textarea
                                value={uploadText}
                                onChange={(e) => setUploadText(e.target.value)}
                                placeholder={`Pega comandos aquí...\n\nEjemplo:\nhtop - Visor interactivo de procesos\nncdu - Analizador de uso de disco\nbpytop - Monitor de recursos`}
                                className="w-full h-40 px-4 py-3 rounded-xl bg-black/30 border border-[#334155] text-white placeholder-[#475569] font-mono text-sm resize-none focus:outline-none focus:border-[#00d4ff]/50"
                            />
                            <button
                                onClick={uploadDocument}
                                disabled={loading !== null || !uploadText.trim()}
                                className="mt-3 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] font-medium hover:bg-[#00d4ff]/20 transition-all disabled:opacity-50"
                            >
                                {loading === 'upload' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                Procesar Texto
                            </button>
                        </div>
                    </div>
                </motion.section>

                {/* Añadir Comando Manual */}
                <motion.section
                    className="glass rounded-2xl p-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                        <Plus className="w-5 h-5 text-[#00ff88]" />
                        Añadir Comando Individual
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-[#94a3b8] mb-1">Comando *</label>
                            <input
                                type="text"
                                value={manualCommand.command}
                                onChange={(e) => setManualCommand({ ...manualCommand, command: e.target.value })}
                                placeholder="ej: htop"
                                className="w-full px-4 py-2.5 rounded-lg bg-black/30 border border-[#334155] text-white font-mono focus:outline-none focus:border-[#00ff88]/50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-[#94a3b8] mb-1">Categoría</label>
                            <select
                                value={manualCommand.category}
                                onChange={(e) => setManualCommand({ ...manualCommand, category: e.target.value })}
                                className="w-full px-4 py-2.5 rounded-lg bg-black/30 border border-[#334155] text-white focus:outline-none focus:border-[#00ff88]/50"
                            >
                                {categories.map(cat => (
                                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-sm text-[#94a3b8] mb-1">Descripción *</label>
                            <input
                                type="text"
                                value={manualCommand.description}
                                onChange={(e) => setManualCommand({ ...manualCommand, description: e.target.value })}
                                placeholder="ej: Visor interactivo de procesos"
                                className="w-full px-4 py-2.5 rounded-lg bg-black/30 border border-[#334155] text-white focus:outline-none focus:border-[#00ff88]/50"
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-sm text-[#94a3b8] mb-1">Etiquetas (separadas por coma)</label>
                            <input
                                type="text"
                                value={manualCommand.tags}
                                onChange={(e) => setManualCommand({ ...manualCommand, tags: e.target.value })}
                                placeholder="ej: monitorización, procesos, interactivo"
                                className="w-full px-4 py-2.5 rounded-lg bg-black/30 border border-[#334155] text-white focus:outline-none focus:border-[#00ff88]/50"
                            />
                        </div>
                    </div>

                    <button
                        onClick={addManualCommand}
                        disabled={loading !== null || !manualCommand.command || !manualCommand.description}
                        className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#00ff88]/10 border border-[#00ff88]/30 text-[#00ff88] font-medium hover:bg-[#00ff88]/20 transition-all disabled:opacity-50"
                    >
                        {loading === 'manual' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
                        Añadir Comando
                    </button>
                </motion.section>
            </div>
        </main>
    );
}

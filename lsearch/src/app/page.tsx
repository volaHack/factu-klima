'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Zap, BookOpen, Github, RefreshCw, Database } from 'lucide-react';
import { SearchBar } from '@/components/SearchBar';
import { CommandCard } from '@/components/CommandCard';
import { CategoryFilter } from '@/components/CategoryFilter';
import type { Command, Category } from '@/lib/types';

// Datos de ejemplo - serán reemplazados por datos de Supabase
const sampleCommands: Command[] = [
  {
    id: '1',
    command: 'ls',
    description: 'Listar contenido del directorio',
    category: 'files',
    examples: [
      { code: 'ls -la', description: 'Listar todos los archivos incluyendo ocultos' },
      { code: 'ls -lh', description: 'Listar con tamaños legibles' },
    ],
    tags: ['directorio', 'listar', 'básico'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '2',
    command: 'grep',
    description: 'Buscar patrones de texto en archivos',
    category: 'text',
    examples: [
      { code: 'grep -r "patrón" .', description: 'Búsqueda recursiva' },
      { code: 'grep -i "patrón" archivo.txt', description: 'Búsqueda sin distinción' },
    ],
    tags: ['buscar', 'texto', 'patrón', 'regex'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '3',
    command: 'nmap',
    description: 'Exploración de red y auditoría de seguridad',
    category: 'security',
    examples: [
      { code: 'nmap -sV objetivo', description: 'Escaneo de detección de versiones' },
      { code: 'nmap -sS -p 1-1000 objetivo', description: 'Escaneo sigiloso SYN' },
    ],
    tags: ['seguridad', 'escaneo', 'puertos', 'red', 'pentesting'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [commands, setCommands] = useState<Command[]>(sampleCommands);
  const [isLoading, setIsLoading] = useState(false);
  const [isSupabaseConnected, setIsSupabaseConnected] = useState(false);

  // Filtrar comandos basado en búsqueda y categoría
  const filteredCommands = useMemo(() => {
    return commands.filter((cmd) => {
      const matchesCategory = !selectedCategory || cmd.category === selectedCategory;
      const matchesSearch = !searchQuery ||
        cmd.command.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cmd.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cmd.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [commands, searchQuery, selectedCategory]);

  // Calcular conteos por categoría
  const categoryCounts = useMemo(() => {
    return commands.reduce((acc, cmd) => {
      acc[cmd.category] = (acc[cmd.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [commands]);

  // Cargar comandos de Supabase al montar
  useEffect(() => {
    fetchCommands();
  }, []);

  const fetchCommands = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/commands');
      if (res.ok) {
        const data = await res.json();
        if (data.commands && data.commands.length > 0) {
          setCommands(data.commands);
          setIsSupabaseConnected(true);
        }
      }
    } catch (error) {
      console.log('Usando datos de ejemplo - Supabase no configurado');
    }
    setIsLoading(false);
  };

  return (
    <main className="min-h-screen px-4 py-12 sm:px-6 lg:px-8">
      {/* Cabecera */}
      <motion.header
        className="text-center mb-12"
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center justify-center gap-3 mb-4">
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
          >
            <Terminal className="w-12 h-12 text-[#00ff88]" />
          </motion.div>
          <h1 className="text-5xl sm:text-6xl font-bold">
            <span className="text-white">L</span>
            <span className="bg-gradient-to-r from-[#00ff88] to-[#00d4ff] bg-clip-text text-transparent">
              Search
            </span>
          </h1>
        </div>
        <p className="text-[#94a3b8] text-lg max-w-2xl mx-auto">
          Tu buscador definitivo de <span className="text-[#00d4ff]">comandos Linux</span> y{' '}
          <span className="text-[#a855f7]">herramientas de ciberseguridad</span>.
          Impulsado por la inteligencia de NotebookLM.
        </p>

        {/* Indicadores de estado */}
        <div className="flex items-center justify-center gap-4 mt-4">
          <div className="flex items-center gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full ${isSupabaseConnected ? 'bg-[#00ff88]' : 'bg-[#fbbf24]'}`} />
            <span className="text-[#64748b]">
              {isSupabaseConnected ? 'Supabase Conectado' : 'Usando Datos de Ejemplo'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Database className="w-3 h-3 text-[#64748b]" />
            <span className="text-[#64748b]">{commands.length} comandos</span>
          </div>
          <button
            onClick={fetchCommands}
            disabled={isLoading}
            className="flex items-center gap-1 text-xs text-[#64748b] hover:text-[#00ff88] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </motion.header>

      {/* Búsqueda */}
      <section className="max-w-4xl mx-auto mb-8">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Buscar cualquier comando..."
        />
      </section>

      {/* Filtro de Categorías */}
      <section className="max-w-4xl mx-auto mb-10">
        <CategoryFilter
          selected={selectedCategory}
          onChange={setSelectedCategory}
          counts={categoryCounts}
        />
      </section>

      {/* Resultados */}
      <section className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <motion.p
            className="text-[#64748b] text-sm"
            key={filteredCommands.length}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            Mostrando {filteredCommands.length} comando{filteredCommands.length !== 1 ? 's' : ''}
            {searchQuery && <span> para &quot;{searchQuery}&quot;</span>}
          </motion.p>
        </div>

        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {filteredCommands.length > 0 ? (
              filteredCommands.map((command, index) => (
                <CommandCard
                  key={command.id}
                  command={command}
                  index={index}
                />
              ))
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-16"
              >
                <Terminal className="w-16 h-16 text-[#334155] mx-auto mb-4" />
                <p className="text-[#64748b] text-lg">No se encontraron comandos</p>
                <p className="text-[#475569] text-sm mt-2">
                  Intenta ajustar tu búsqueda o filtros
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* Pie de página */}
      <motion.footer
        className="mt-20 text-center text-[#475569] text-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <div className="flex items-center justify-center gap-6 mb-4">
          <a
            href="/admin"
            className="flex items-center gap-2 hover:text-[#00ff88] transition-colors"
          >
            <BookOpen className="w-4 h-4" />
            Panel Admin
          </a>
          <a
            href="/admin"
            className="flex items-center gap-2 hover:text-[#00ff88] transition-colors"
          >
            <Zap className="w-4 h-4" />
            Sincronizar
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:text-[#00ff88] transition-colors"
          >
            <Github className="w-4 h-4" />
            GitHub
          </a>
        </div>
        <p>Construido con Next.js, Supabase y NotebookLM MCP</p>
      </motion.footer>
    </main>
  );
}

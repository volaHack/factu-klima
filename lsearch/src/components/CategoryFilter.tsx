'use client';

import { motion } from 'framer-motion';
import {
    Network, Shield, FolderOpen, Monitor, Activity,
    FileText, Lock, HardDrive, Users, Code, Sparkles
} from 'lucide-react';
import type { Category } from '@/lib/types';

interface CategoryFilterProps {
    selected: Category | null;
    onChange: (category: Category | null) => void;
    counts?: Record<string, number>;
}

const categories: { id: Category | 'all'; label: string; icon: React.ElementType; color: string }[] = [
    { id: 'all', label: 'Todos', icon: Sparkles, color: '#00ff88' },
    { id: 'networking', label: 'Redes', icon: Network, color: '#00d4ff' },
    { id: 'security', label: 'Seguridad', icon: Shield, color: '#a855f7' },
    { id: 'files', label: 'Archivos', icon: FolderOpen, color: '#00ff88' },
    { id: 'system', label: 'Sistema', icon: Monitor, color: '#fbbf24' },
    { id: 'process', label: 'Procesos', icon: Activity, color: '#ef4444' },
    { id: 'text', label: 'Texto', icon: FileText, color: '#06b6d4' },
    { id: 'permissions', label: 'Permisos', icon: Lock, color: '#f97316' },
    { id: 'disk', label: 'Disco', icon: HardDrive, color: '#64748b' },
    { id: 'users', label: 'Usuarios', icon: Users, color: '#ec4899' },
    { id: 'scripting', label: 'Script', icon: Code, color: '#eab308' },
];

export function CategoryFilter({ selected, onChange, counts }: CategoryFilterProps) {
    return (
        <motion.div
            className="flex flex-wrap justify-center gap-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
        >
            {categories.map((cat) => {
                const isActive = cat.id === 'all' ? selected === null : selected === cat.id;
                const Icon = cat.icon;
                const count = cat.id === 'all'
                    ? Object.values(counts || {}).reduce((a, b) => a + b, 0)
                    : counts?.[cat.id] || 0;

                const baseClass = 'relative flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all duration-300';
                const activeClass = isActive
                    ? 'text-white shadow-lg'
                    : 'text-[#64748b] hover:text-white bg-white/5 hover:bg-white/10';

                return (
                    <motion.button
                        key={cat.id}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => onChange(cat.id === 'all' ? null : cat.id)}
                        className={`${baseClass} ${activeClass}`}
                        style={{
                            backgroundColor: isActive ? `${cat.color}20` : undefined,
                            boxShadow: isActive ? `0 0 20px ${cat.color}30` : undefined,
                        }}
                    >
                        <Icon
                            className="w-4 h-4"
                            style={{ color: isActive ? cat.color : undefined }}
                        />
                        <span>{cat.label}</span>
                        {count > 0 && (
                            <span className={`ml-1 px-1.5 py-0.5 rounded-md text-xs ${isActive ? 'bg-white/20' : 'bg-white/10'}`}>
                                {count}
                            </span>
                        )}

                        {isActive && (
                            <motion.div
                                layoutId="activeCategory"
                                className="absolute inset-0 rounded-xl -z-10"
                                style={{
                                    background: `linear-gradient(135deg, ${cat.color}15 0%, ${cat.color}05 100%)`,
                                }}
                                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                            />
                        )}
                    </motion.button>
                );
            })}
        </motion.div>
    );
}

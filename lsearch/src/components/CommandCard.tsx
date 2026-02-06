'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, ChevronDown, ChevronUp, Terminal } from 'lucide-react';
import type { Command } from '@/lib/types';

interface CommandCardProps {
    command: Command;
    index: number;
}

const categoryStyles: Record<string, { color: string; bgColor: string }> = {
    networking: { color: '#00d4ff', bgColor: 'rgba(0, 212, 255, 0.15)' },
    security: { color: '#a855f7', bgColor: 'rgba(168, 85, 247, 0.15)' },
    files: { color: '#00ff88', bgColor: 'rgba(0, 255, 136, 0.15)' },
    system: { color: '#fbbf24', bgColor: 'rgba(251, 191, 36, 0.15)' },
    process: { color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.15)' },
    text: { color: '#06b6d4', bgColor: 'rgba(6, 182, 212, 0.15)' },
    permissions: { color: '#f97316', bgColor: 'rgba(249, 115, 22, 0.15)' },
    packages: { color: '#8b5cf6', bgColor: 'rgba(139, 92, 246, 0.15)' },
    monitoring: { color: '#14b8a6', bgColor: 'rgba(20, 184, 166, 0.15)' },
    disk: { color: '#64748b', bgColor: 'rgba(100, 116, 139, 0.15)' },
    users: { color: '#ec4899', bgColor: 'rgba(236, 72, 153, 0.15)' },
    scripting: { color: '#eab308', bgColor: 'rgba(234, 179, 8, 0.15)' },
};

export function CommandCard({ command, index }: CommandCardProps) {
    const [copied, setCopied] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const style = categoryStyles[command.category] || categoryStyles.files;

    const copyCommand = async () => {
        await navigator.clipboard.writeText(command.command);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const hasExamples = command.examples && command.examples.length > 0;

    const cardClass = 'relative p-5 rounded-xl bg-[#111827]/60 backdrop-blur-md border border-[#1e293b] transition-all duration-300 hover:shadow-lg hover:translate-y-[-2px]';
    const tagClass = 'px-2 py-0.5 rounded-md text-xs font-medium bg-white/5 text-[#64748b] border border-white/10';
    const expandBtnClass = 'flex items-center gap-2 mt-4 text-sm font-medium text-[#64748b] hover:text-white transition-colors';
    const copyBtnClass = copied
        ? 'p-2.5 rounded-lg transition-all duration-200 bg-[#00ff88]/20 text-[#00ff88]'
        : 'p-2.5 rounded-lg transition-all duration-200 bg-white/5 text-[#64748b] hover:bg-white/10 hover:text-white';

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            layout
            className="group"
        >
            <div
                className={cardClass}
                style={{
                    borderColor: expanded ? `${style.color}40` : undefined,
                    boxShadow: expanded ? `0 10px 40px ${style.color}10` : undefined,
                }}
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                            <Terminal className="w-4 h-4" style={{ color: style.color }} />
                            <code
                                className="text-xl font-bold font-mono text-white cursor-pointer hover:underline"
                                onClick={copyCommand}
                            >
                                {command.command}
                            </code>
                            <span
                                className="px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wider"
                                style={{
                                    backgroundColor: style.bgColor,
                                    color: style.color,
                                }}
                            >
                                {command.category}
                            </span>
                        </div>
                        <p className="text-[#94a3b8] text-sm leading-relaxed">
                            {command.description}
                        </p>
                    </div>

                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={copyCommand}
                        className={copyBtnClass}
                    >
                        <AnimatePresence mode="wait">
                            {copied ? (
                                <motion.div
                                    key="check"
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    exit={{ scale: 0 }}
                                >
                                    <Check className="w-4 h-4" />
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="copy"
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    exit={{ scale: 0 }}
                                >
                                    <Copy className="w-4 h-4" />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.button>
                </div>

                {command.tags && command.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                        {command.tags.slice(0, 5).map((tag) => (
                            <span key={tag} className={tagClass}>
                                #{tag}
                            </span>
                        ))}
                        {command.tags.length > 5 && (
                            <span className="text-xs text-[#475569]">
                                +{command.tags.length - 5} more
                            </span>
                        )}
                    </div>
                )}

                {hasExamples && (
                    <>
                        <button onClick={() => setExpanded(!expanded)} className={expandBtnClass}>
                            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            {expanded ? 'Hide' : 'Show'} {command.examples.length} example{command.examples.length > 1 ? 's' : ''}
                        </button>

                        <AnimatePresence>
                            {expanded && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                >
                                    <div className="mt-4 space-y-3">
                                        {command.examples.map((example, i) => (
                                            <ExampleItem key={i} example={example} color={style.color} />
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </>
                )}

                <div
                    className="absolute top-0 right-0 w-16 h-16 opacity-10 rounded-tr-xl"
                    style={{
                        background: `linear-gradient(135deg, transparent 50%, ${style.color} 50%)`
                    }}
                />
            </div>
        </motion.div>
    );
}

function ExampleItem({ example, color }: { example: { code: string; description: string }; color: string }) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        await navigator.clipboard.writeText(example.code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="p-3 rounded-lg bg-black/30 border border-white/5">
            <div className="flex items-center justify-between gap-3 mb-1">
                <code
                    className="text-sm font-mono cursor-pointer hover:underline"
                    style={{ color }}
                    onClick={copy}
                >
                    $ {example.code}
                </code>
                <button onClick={copy} className="p-1 rounded hover:bg-white/10 transition-colors">
                    {copied ? (
                        <Check className="w-3 h-3 text-[#00ff88]" />
                    ) : (
                        <Copy className="w-3 h-3 text-[#475569]" />
                    )}
                </button>
            </div>
            <p className="text-xs text-[#64748b]">{example.description}</p>
        </div>
    );
}

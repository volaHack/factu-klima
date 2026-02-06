'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Command } from 'lucide-react';

interface SearchBarProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

export function SearchBar({ value, onChange, placeholder = 'Search commands...' }: SearchBarProps) {
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                inputRef.current?.focus();
            }
            if (e.key === 'Escape') {
                inputRef.current?.blur();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const containerClass = `relative w-full max-w-2xl mx-auto transition-all duration-300 ${isFocused ? 'scale-[1.02]' : ''}`;

    const innerClass = [
        'relative flex items-center gap-3 px-5 py-4',
        'bg-[#111827]/80 backdrop-blur-xl',
        'border rounded-2xl',
        'transition-all duration-300',
        isFocused
            ? 'border-[#00ff88]/50 shadow-[0_0_30px_rgba(0,255,136,0.2)]'
            : 'border-[#00ff88]/20 hover:border-[#00ff88]/30'
    ].join(' ');

    const inputClass = 'flex-1 bg-transparent outline-none text-lg text-white placeholder-[#64748b] font-mono';

    return (
        <motion.div
            className={containerClass}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
        >
            <div className={innerClass}>
                <Search
                    className={`w-5 h-5 transition-colors duration-300 ${isFocused ? 'text-[#00ff88]' : 'text-[#94a3b8]'}`}
                />

                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    placeholder={placeholder}
                    className={inputClass}
                />

                <AnimatePresence>
                    {value && (
                        <motion.button
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            onClick={() => onChange('')}
                            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
                        >
                            <X className="w-4 h-4 text-[#94a3b8]" />
                        </motion.button>
                    )}
                </AnimatePresence>


            </div>

            <motion.div
                className="absolute inset-0 -z-10 rounded-2xl opacity-50"
                animate={{
                    boxShadow: isFocused
                        ? '0 0 60px rgba(0, 255, 136, 0.15)'
                        : '0 0 0px rgba(0, 255, 136, 0)'
                }}
                transition={{ duration: 0.3 }}
            />
        </motion.div>
    );
}

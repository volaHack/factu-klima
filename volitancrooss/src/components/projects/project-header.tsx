"use client";

import Link from "next/link";
import {
    ArrowLeft,
    Clock,
    ArrowUpRight,
    Eye,
    CheckCircle2,
    XCircle,
    AlertCircle,
} from "lucide-react";

export const statusConfig: Record<
    string,
    { label: string; icon: typeof Clock; class: string }
> = {
    pending: {
        label: "Pendiente",
        icon: Clock,
        class: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    },
    in_progress: {
        label: "En progreso",
        icon: ArrowUpRight,
        class: "text-blue-500 bg-blue-500/10 border-blue-500/20",
    },
    review: {
        label: "En revision",
        icon: Eye,
        class: "text-purple-500 bg-purple-500/10 border-purple-500/20",
    },
    completed: {
        label: "Completado",
        icon: CheckCircle2,
        class: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
    },
    cancelled: {
        label: "Cancelado",
        icon: XCircle,
        class: "text-red-500 bg-red-500/10 border-red-500/20",
    },
};

export const priorityConfig: Record<
    string,
    { label: string; class: string }
> = {
    low: { label: "Baja", class: "text-slate-400 bg-slate-400/10 border-slate-400/20" },
    medium: { label: "Media", class: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
    high: { label: "Alta", class: "text-orange-400 bg-orange-400/10 border-orange-400/20" },
    urgent: { label: "Urgente", class: "text-red-400 bg-red-400/10 border-red-400/20" },
};

interface ProjectHeaderProps {
    title: string;
    status: string;
    priority: string;
    role: "admin" | "client";
}

export function ProjectHeader({ title, status, priority, role }: ProjectHeaderProps) {
    const statusEntry = statusConfig[status] || statusConfig.pending;
    const priorityEntry = priorityConfig[priority] || priorityConfig.medium;
    const StatusIcon = statusEntry.icon;
    const backHref = role === "admin" ? "/admin/projects" : "/dashboard/projects";

    return (
        <div className="flex items-center gap-3">
            <Link
                href={backHref}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
                <ArrowLeft className="size-5" />
            </Link>

            <h1 className="min-w-0 flex-1 truncate text-xl font-bold tracking-tight">
                {title}
            </h1>

            <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusEntry.class}`}
            >
                <StatusIcon className="size-3" />
                {statusEntry.label}
            </span>

            <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${priorityEntry.class}`}
            >
                <AlertCircle className="size-3" />
                {priorityEntry.label}
            </span>
        </div>
    );
}

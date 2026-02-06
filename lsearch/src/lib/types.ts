export interface Command {
    id: string;
    command: string;
    description: string;
    category: Category;
    subcategory?: string;
    examples: CommandExample[];
    tags: string[];
    source_notebook_id?: string;
    created_at: string;
    updated_at: string;
}

export interface CommandExample {
    code: string;
    description: string;
}

export type Category =
    | 'networking'
    | 'security'
    | 'files'
    | 'system'
    | 'process'
    | 'text'
    | 'permissions'
    | 'packages'
    | 'monitoring'
    | 'disk'
    | 'users'
    | 'scripting';

export interface SearchFilters {
    query: string;
    category?: Category;
    tags?: string[];
}

export interface NotebookInfo {
    id: string;
    title: string;
    source_count: number;
    url: string;
}

export const CATEGORY_INFO: Record<Category, { label: string; color: string; bgColor: string }> = {
    networking: { label: 'Networking', color: '#00d4ff', bgColor: 'rgba(0, 212, 255, 0.2)' },
    security: { label: 'Security', color: '#a855f7', bgColor: 'rgba(168, 85, 247, 0.2)' },
    files: { label: 'Files', color: '#00ff88', bgColor: 'rgba(0, 255, 136, 0.2)' },
    system: { label: 'System', color: '#fbbf24', bgColor: 'rgba(251, 191, 36, 0.2)' },
    process: { label: 'Process', color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.2)' },
    text: { label: 'Text', color: '#06b6d4', bgColor: 'rgba(6, 182, 212, 0.2)' },
    permissions: { label: 'Permissions', color: '#f97316', bgColor: 'rgba(249, 115, 22, 0.2)' },
    packages: { label: 'Packages', color: '#8b5cf6', bgColor: 'rgba(139, 92, 246, 0.2)' },
    monitoring: { label: 'Monitoring', color: '#14b8a6', bgColor: 'rgba(20, 184, 166, 0.2)' },
    disk: { label: 'Disk', color: '#64748b', bgColor: 'rgba(100, 116, 139, 0.2)' },
    users: { label: 'Users', color: '#ec4899', bgColor: 'rgba(236, 72, 153, 0.2)' },
    scripting: { label: 'Scripting', color: '#eab308', bgColor: 'rgba(234, 179, 8, 0.2)' },
};

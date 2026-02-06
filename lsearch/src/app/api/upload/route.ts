import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Función mejorada para detectar categorías con más keywords en español e inglés
function detectCategory(text: string): string {
    const l = text.toLowerCase();

    // Networking
    if (/network|ssh|http|port|ip |tcp|udp|dns|ping|curl|wget|red|tráfico|conexi|protocolo|servidor|cliente|interfaz/.test(l)) return 'networking';

    // Security / Pentesting
    if (/security|password|encrypt|firewall|hack|vuln|seguridad|contraseña|acceso|bloquea|ataque|force|fuerza|bruta|fuzz|inyecci|injection|exploit|penetración|auditoría|malware|virus|rootkit|troyano|backdoor|sniff|spoof|mitm/.test(l)) return 'security';

    // Files
    if (/file|directory|folder|copy|move|archivo|directorio|carpeta|copia|mueve|borra|elimina|lista|permiso|propietario/.test(l)) return 'files';

    // Process
    if (/process|pid|kill|cpu|memory|proceso|memoria|ejecu|actividad|monitor|top|htop/.test(l)) return 'process';

    // Text
    if (/text|string|pattern|grep|texto|patrón|cadena|línea|reemplaza|busca|filtra|edita|cat |vi |nano/.test(l)) return 'text';

    // Disk
    if (/disk|storage|mount|disco|almacenamiento|espacio|parti|format|monta|sistema de ficheros/.test(l)) return 'disk';

    // Users
    if (/user|account|group|usuario|cuenta|grupo|sesión|login|sudo|root/.test(l)) return 'users';

    return 'system';
}

// Función para extraer etiquetas automáticamente
function extractTags(text: string): string[] {
    const tags: string[] = [];
    const l = text.toLowerCase();

    const keywords = [
        'wifi', 'wireless', 'inalámbrica', 'monitor', 'packet', 'paquete', 'injection', 'inyección',
        'brute', 'fuerza', 'fuzzing', 'sql', 'db', 'database', 'web', 'http', 'https', 'ssl', 'tls',
        'network', 'red', 'security', 'seguridad', 'audit', 'auditoría', 'scan', 'escaneo',
        'vuln', 'exploit', 'password', 'contraseña', 'hash', 'crack', 'linux', 'system', 'sistema',
        'file', 'archivo', 'process', 'proceso', 'monitor', 'performance', 'rendimiento'
    ];

    for (const k of keywords) {
        if (l.includes(k)) {
            // Mapear traducciones a tags estándar si es necesario, o dejar ambos
            tags.push(k);
        }
    }

    return tags.slice(0, 5); // Máximo 5 tags automáticos
}

function parseDocument(content: string, format: string): Array<any> {
    const commands: Array<any> = [];

    if (format === 'json') {
        try {
            // Limpiar el contenido de posibles caracteres extra
            let cleanContent = content.trim();
            if (cleanContent.endsWith('.')) {
                cleanContent = cleanContent.slice(0, -1);
            }
            // Fix común: si falta el corchete de cierre
            if (cleanContent.startsWith('[') && !cleanContent.endsWith(']')) {
                cleanContent += ']';
            }

            const parsed = JSON.parse(cleanContent);
            const items = Array.isArray(parsed) ? parsed : [parsed];

            for (const item of items) {
                // Soportar campos en español, inglés y variantes
                const cmd = item.command || item.comando || item.herramienta;
                const desc = item.description || item.descripcion;

                if (cmd && desc) {
                    const fullText = cmd + ' ' + desc;
                    commands.push({
                        command: cmd.toLowerCase().trim(),
                        description: desc.trim(),
                        category: item.category || item.categoria || detectCategory(fullText),
                        examples: item.examples || item.ejemplos || [],
                        tags: item.tags || item.etiquetas || extractTags(fullText)
                    });
                }
            }
        } catch (e) {
            console.error('Error parseando JSON:', e);
        }
    } else {
        // Formato texto: comando - descripción (uno por línea)
        const lines = content.split('\n').filter(line => line.trim());
        for (const line of lines) {
            const dashMatch = line.match(/^([a-zA-Z0-9_-]+)\s*[-:]\s*(.+)/);
            if (dashMatch) {
                const cmd = dashMatch[1].trim().toLowerCase();
                const desc = dashMatch[2].trim();
                const fullText = cmd + ' ' + desc;
                commands.push({
                    command: cmd,
                    description: desc,
                    category: detectCategory(fullText),
                    examples: [],
                    tags: extractTags(fullText)
                });
            }
        }
    }

    return commands;
}

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const textContent = formData.get('content') as string | null;
        const file = formData.get('file') as File | null;
        let format = formData.get('format') as string || 'text';

        let content = textContent || '';

        // Si hay un archivo, leer su contenido
        if (file) {
            content = await file.text();
            if (file.name.endsWith('.json')) {
                format = 'json';
            }
        }

        if (!content.trim()) {
            return NextResponse.json({ success: false, error: 'Sin contenido' }, { status: 400 });
        }

        // Auto-detectar formato JSON
        if (content.trim().startsWith('[') || content.trim().startsWith('{')) {
            format = 'json';
        }

        console.log(`Procesando documento (${format}), ${content.length} caracteres`);
        const commands = parseDocument(content, format);
        console.log(`Encontrados ${commands.length} comandos`);

        if (commands.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'No se encontraron comandos. Usa formato JSON [{comando/herramienta, descripcion}] o texto "comando - descripción"'
            }, { status: 400 });
        }

        let inserted = 0;
        const errors: string[] = [];

        for (const cmd of commands) {
            console.log(`Insertando: ${cmd.command}`);
            const { error } = await supabase
                .from('commands')
                .upsert({
                    command: cmd.command,
                    description: cmd.description,
                    category: cmd.category,
                    examples: cmd.examples,
                    tags: cmd.tags,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'command' });

            if (error) {
                console.error(`Error en ${cmd.command}:`, error.message);
                errors.push(`${cmd.command}: ${error.message}`);
            } else {
                inserted++;
            }
        }

        return NextResponse.json({
            success: inserted > 0,
            message: `Procesados: ${inserted} de ${commands.length} comandos`,
            stats: { inserted, updated: 0, errors: errors.length },
            errors: errors.slice(0, 5)
        });
    } catch (error) {
        console.error('Error en upload:', error);
        return NextResponse.json({ success: false, error: 'Error al procesar documento' }, { status: 500 });
    }
}

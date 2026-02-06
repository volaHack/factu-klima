import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { supabase } from '@/lib/supabase';

const NOTEBOOK_ID = process.env.NOTEBOOKLM_NOTEBOOK_ID || '03df5b37-f1ea-40d5-b9c2-79a20a047a43';
// Usar variable de entorno para la ruta, fallback a la ruta local actual para desarrollo
const MCP_SERVER_PATH = process.env.MCP_SERVER_PATH || 'C:/Users/volit/AppData/Roaming/Python/Python312/Scripts/notebooklm-mcp.exe';

interface CommandData {
    command: string;
    description: string;
    category: string;
    examples: Array<{ code: string; description: string }>;
    tags: string[];
}

interface MCPResult {
    content?: Array<{ text?: string }>;
    structuredContent?: { answer?: string; status?: string };
    isError?: boolean;
}

// Diccionario de respaldo masivo (>100 comandos)
const FALLBACK_DATA: Record<string, Array<{ code: string; description: string }>> = {
    // --- Archivos y Directorios ---
    ls: [{ code: 'ls -la', description: 'Listar todos los archivos con detalles y ocultos' }],
    cd: [{ code: 'cd /var/www', description: 'Cambiar al directorio especificado' }],
    pwd: [{ code: 'pwd', description: 'Mostrar la ruta del directorio actual' }],
    cp: [{ code: 'cp -r carpeta/ destino/', description: 'Copiar directorio recursivamente' }],
    mv: [{ code: 'mv archivo.txt nuevo.txt', description: 'Mover o renombrar archivos' }],
    rm: [{ code: 'rm -rf directorio/', description: 'Eliminar directorio y contenido forzosamente' }],
    mkdir: [{ code: 'mkdir -p a/b/c', description: 'Crear jerarquía de directorios' }],
    rmdir: [{ code: 'rmdir carpeta_vacia', description: 'Eliminar directorio vacío' }],
    touch: [{ code: 'touch archivo.txt', description: 'Crear archivo vacío o actualizar timestamp' }],
    ln: [{ code: 'ln -s archivo link', description: 'Crear enlace simbólico' }],
    find: [{ code: 'find . -name "*.log"', description: 'Buscar archivos por patrón de nombre' }],
    locate: [{ code: 'locate archivo.txt', description: 'Buscar archivos en base de datos indexada' }],
    whereis: [{ code: 'whereis python', description: 'Ubicar binario, fuente y manual de un comando' }],
    which: [{ code: 'which node', description: 'Mostrar ruta del ejecutable' }],
    tree: [{ code: 'tree -L 2', description: 'Mostrar estructura de directorios en árbol' }],

    // --- Visualización y Edición de Texto ---
    cat: [{ code: 'cat archivo.txt', description: 'Mostrar contenido completo del archivo' }],
    tac: [{ code: 'tac archivo.txt', description: 'Mostrar contenido en orden inverso' }],
    more: [{ code: 'more archivo.txt', description: 'Ver archivo paginado' }],
    less: [{ code: 'less archivo.txt', description: 'Visor de archivos interactivo y avanzado' }],
    head: [{ code: 'head -n 20 file', description: 'Ver primeras 20 líneas' }],
    tail: [{ code: 'tail -f file.log', description: 'Ver últimas líneas en tiempo real (follow)' }],
    nano: [{ code: 'nano archivo.txt', description: 'Editor de texto simple en terminal' }],
    vim: [{ code: 'vim archivo.txt', description: 'Editor de texto avanzado modal' }],
    vi: [{ code: 'vi archivo.txt', description: 'Editor de texto estándar Unix' }],

    // --- Procesamiento de Texto ---
    grep: [{ code: 'grep -r "error" .', description: 'Buscar texto recursivamente en archivos' }],
    sed: [{ code: 'sed "s/foo/bar/g" file', description: 'Reemplazar texto usando expresiones regulares' }],
    awk: [{ code: 'awk "{print $1}" file', description: 'Procesamiento de texto por columnas' }],
    cut: [{ code: 'cut -d: -f1 /etc/passwd', description: 'Cortar secciones de líneas' }],
    sort: [{ code: 'sort -n numeros.txt', description: 'Ordenar líneas de texto numéricamente' }],
    uniq: [{ code: 'uniq -c', description: 'Reportar o filtrar líneas repetidas' }],
    wc: [{ code: 'wc -l archivo.txt', description: 'Contar líneas, palabras y caracteres' }],
    tr: [{ code: 'echo "hola" | tr "a-z" "A-Z"', description: 'Traducir o eliminar caracteres' }],
    diff: [{ code: 'diff file1 file2', description: 'Comparar archivos línea a línea' }],
    cmp: [{ code: 'cmp file1 file2', description: 'Comparar archivos byte a byte' }],
    tee: [{ code: 'echo "hola" | tee log.txt', description: 'Leer stdin y escribir a stdout y archivos' }],
    echo: [{ code: 'echo "Texto" > archivo', description: 'Imprimir texto o escribir a archivo' }],
    printf: [{ code: 'printf "Nombre: %s\\n" "Juan"', description: 'Formatear e imprimir datos' }],

    // --- Redes ---
    ping: [{ code: 'ping -c 4 google.com', description: 'Probar conectividad enviando paquetes ICMP' }],
    curl: [{ code: 'curl -I example.com', description: 'Transferir datos con URL (headers only)' }],
    wget: [{ code: 'wget file.zip', description: 'Descargar archivos de la web no interactivo' }],
    ssh: [{ code: 'ssh -p 22 user@host', description: 'Cliente OpenSSH para acceso remoto seguro' }],
    scp: [{ code: 'scp -P 22 file user@host:', description: 'Copia segura de archivos entre hosts' }],
    rsync: [{ code: 'rsync -avz origen/ destino/', description: 'Sincronización rápida y versátil de archivos' }],
    netstat: [{ code: 'netstat -tuln', description: 'Estadísticas de red, routing y puertos' }],
    ss: [{ code: 'ss -tulpn', description: 'Utilidad moderna para investigar sockets' }],
    ifconfig: [{ code: 'ifconfig eth0', description: 'Configurar interfaz de red (deprecated)' }],
    ip: [{ code: 'ip addr show', description: 'Mostrar/manipular rutas, dispositivos y túneles' }],
    route: [{ code: 'route -n', description: 'Mostrar/manipular tabla de enrutamiento IP' }],
    traceroute: [{ code: 'traceroute google.com', description: 'Rastrear ruta de paquetes al host' }],
    tracepath: [{ code: 'tracepath google.com', description: 'Rastrear ruta MTU discovery' }],
    nslookup: [{ code: 'nslookup google.com', description: 'Consultar servidores de nombres DNS' }],
    dig: [{ code: 'dig +short google.com', description: 'Consultas DNS avanzadas' }],
    host: [{ code: 'host google.com', description: 'Utilidad simple de búsqueda DNS' }],
    whois: [{ code: 'whois domain.com', description: 'Información de registro de dominios' }],
    nc: [{ code: 'nc -lvp 4444', description: 'Netcat: leer/escribir datos a través de red TCP/UDP' }],
    telnet: [{ code: 'telnet google.com 80', description: 'Interfaz de usuario para protocolo TELNET' }],
    tcpdump: [{ code: 'tcpdump -i eth0 port 80', description: 'Captura y análisis de paquetes' }],
    iptables: [{ code: 'iptables -L', description: 'Administración de firewall IPv4' }],
    ufw: [{ code: 'ufw status', description: 'Uncomplicated Firewall (frontend iptables)' }],
    arp: [{ code: 'arp -a', description: 'Manipular caché ARP del sistema' }],

    // --- Seguridad y Hacking ---
    nmap: [{ code: 'nmap -sV -sC localhost', description: 'Escáner de red y auditoría de seguridad' }],
    nikto: [{ code: 'nikto -h http://site.com', description: 'Escáner de vulnerabilidades servidor web' }],
    hydra: [{ code: 'hydra -l user -P pass.txt ssh://ip', description: 'Cracker de logins paralelo' }],
    john: [{ code: 'john --wordlist=rockyou.txt hash', description: 'Cracker de contraseñas avanzado' }],
    hashcat: [{ code: 'hashcat -m 0 hash list', description: 'Utilidad de recuperación de contraseñas (GPU)' }],
    metasploit: [{ code: 'msfconsole', description: 'Plataforma de desarrollo de exploits' }],
    wireshark: [{ code: 'wireshark', description: 'Analizador de protocolos de red gráfico' }],
    tshark: [{ code: 'tshark -r file.pcap', description: 'Versión CLI de Wireshark' }],
    sqlmap: [{ code: 'sqlmap -u "http://site.com?id=1" --dbs', description: 'Herramienta automática de inyección SQL' }],
    dirb: [{ code: 'dirb http://url', description: 'Escáner de contenido web por diccionario' }],
    gobuster: [{ code: 'gobuster dir -u url -w list.txt', description: 'Fuerza bruta de URIs, DNS y VHosts' }],
    burpsuite: [{ code: 'burpsuite', description: 'Plataforma para pruebas de seguridad web' }],
    aircrack: [{ code: 'aircrack-ng capture.cap', description: 'Suite de auditoría WiFi (802.11)' }],
    airodump: [{ code: 'airodump-ng wlan0mon', description: 'Captura de paquetes 802.11 raw' }],
    aireplay: [{ code: 'aireplay-ng --deauth 10 -a BSSID wlan0', description: 'Inyección de paquetes WiFi' }],
    wpscan: [{ code: 'wpscan --url blog.com', description: 'Escáner de seguridad WordPress' }],
    searchsploit: [{ code: 'searchsploit apache 2.4', description: 'Buscador de exploits en Exploit-DB' }],
    proxychains: [{ code: 'proxychains nmap target', description: 'Redirigir conexiones por proxies/TOR' }],
    macchanger: [{ code: 'macchanger -r eth0', description: 'Cambiar dirección MAC' }],
    cewl: [{ code: 'cewl http://site.com -w dict.txt', description: 'Generador de wordlists basado en web' }],
    wfuzz: [{ code: 'wfuzz -c -z file,dict.txt http://site/FUZZ', description: 'Fuzzer de aplicaciones web' }],
    masscan: [{ code: 'masscan -p80 0.0.0.0/0', description: 'Escáner de puertos masivo Internet-scale' }],
    sublist3r: [{ code: 'sublist3r -d domain.com', description: 'Enumeración de subdominios OSINT' }],
    theharvester: [{ code: 'theHarvester -d domain.com -b google', description: 'Recolección de emails y dominios' }],
    enum4linux: [{ code: 'enum4linux -a target', description: 'Enumeración de información SMB/Samba' }],
    smbclient: [{ code: 'smbclient -L //host', description: 'Cliente FTP-like para SMB/CIFS' }],
    responder: [{ code: 'responder -I eth0', description: 'Envenenador LLMNR/NBT-NS/MDNS' }],
    mimikatz: [{ code: 'mimikatz.exe', description: 'Extracción de credenciales Windows (solo ref)' }],

    // --- Sistema y Procesos ---
    ps: [{ code: 'ps aux', description: 'Instantánea de procesos actuales' }],
    top: [{ code: 'top', description: 'Monitor de procesos dinámico' }],
    htop: [{ code: 'htop', description: 'Visor de procesos interactivo mejorado' }],
    kill: [{ code: 'kill -9 1234', description: 'Enviar señal a proceso (terminar)' }],
    killall: [{ code: 'killall firefox', description: 'Matar procesos por nombre' }],
    pkill: [{ code: 'pkill -u user', description: 'Señalizar procesos por atributos' }],
    pgrep: [{ code: 'pgrep nginx', description: 'Buscar PID de procesos por nombre' }],
    systemctl: [{ code: 'systemctl status nginx', description: 'Controlar sistema systemd y servicios' }],
    service: [{ code: 'service nginx start', description: 'Ejecutar script de inicio SysV' }],
    journalctl: [{ code: 'journalctl -xe', description: 'Consultar logs de systemd' }],
    dmesg: [{ code: 'dmesg | tail', description: 'Imprimir bufer de mensajes del kernel' }],
    lsof: [{ code: 'lsof -i :80', description: 'Listar archivos abiertos (y puertos)' }],
    strace: [{ code: 'strace ls', description: 'Tracear llamadas al sistema' }],
    uptime: [{ code: 'uptime', description: 'Tiempo encendido y carga del sistema' }],
    free: [{ code: 'free -h', description: 'Mostrar uso de memoria RAM y Swap' }],
    uname: [{ code: 'uname -a', description: 'Imprimir información del sistema' }],
    hostname: [{ code: 'hostname', description: 'Mostrar o establecer nombre del host' }],
    lsblk: [{ code: 'lsblk', description: 'Listar dispositivos de bloque' }],
    fdisk: [{ code: 'fdisk -l', description: 'Manipular tablas de particiones' }],
    mount: [{ code: 'mount /dev/sdb1 /mnt', description: 'Montar sistema de archivos' }],
    umount: [{ code: 'umount /mnt', description: 'Desmontar sistema de archivos' }],
    df: [{ code: 'df -h', description: 'Reporte de uso de espacio en disco' }],
    du: [{ code: 'du -sh folder', description: 'Estimación de uso de espacio de archivo' }],

    // --- Permisos y Usuarios ---
    chmod: [{ code: 'chmod 755 script.sh', description: 'Cambiar modo/permisos de archivos' }],
    chown: [{ code: 'chown user:group file', description: 'Cambiar propietario y grupo' }],
    chgrp: [{ code: 'chgrp group file', description: 'Cambiar grupo de archivo' }],
    useradd: [{ code: 'useradd newuser', description: 'Crear un nuevo usuario' }],
    usermod: [{ code: 'usermod -aG sudo user', description: 'Modificar cuenta de usuario' }],
    userdel: [{ code: 'userdel user', description: 'Eliminar usuario' }],
    passwd: [{ code: 'passwd user', description: 'Cambiar contraseña de usuario' }],
    su: [{ code: 'su -', description: 'Cambiar ID de usuario o ser superusuario' }],
    sudo: [{ code: 'sudo apt update', description: 'Ejecutar comando como otro usuario (root)' }],
    id: [{ code: 'id', description: 'Imprimir IDs de usuario y grupo reales/efectivos' }],
    who: [{ code: 'who', description: 'Mostrar quién está logueado' }],
    w: [{ code: 'w', description: 'Mostrar quién está logueado y qué hacen' }],
    last: [{ code: 'last', description: 'Mostrar listado de últimos usuarios logueados' }],

    // --- Archivos y Compresión ---
    tar: [{ code: 'tar -czf archivo.tar.gz carpeta', description: 'Archivador (Tape ARchiver)' }],
    gzip: [{ code: 'gzip archivo.txt', description: 'Comprimir archivos' }],
    gunzip: [{ code: 'gunzip archivo.gz', description: 'Descomprimir archivos' }],
    zip: [{ code: 'zip -r archivo.zip carpeta', description: 'Empaquetar y comprimir zip' }],
    unzip: [{ code: 'unzip archivo.zip', description: 'Listar y extraer zip' }],

    // --- Desarrollo y Varios ---
    git: [{ code: 'git commit -m "msg"', description: 'Control de versiones distribuido' }],
    docker: [{ code: 'docker run -it ubuntu', description: 'Ejecutar aplicaciones en contenedores' }],
    node: [{ code: 'node app.js', description: 'Entorno de ejecución JavaScript' }],
    npm: [{ code: 'npm install', description: 'Gestor de paquetes de Node.js' }],
    python: [{ code: 'python script.py', description: 'Intérprete lenguaje Python' }],
    pip: [{ code: 'pip install requests', description: 'Instalador de paquetes Python' }],
    gcc: [{ code: 'gcc main.c -o app', description: 'Compilador C de GNU' }],
    make: [{ code: 'make', description: 'Utilidad para compilar grupos de programas' }],
    crontab: [{ code: 'crontab -e', description: 'Mantener tablas de crontab para cron' }],
    alias: [{ code: 'alias ll="ls -la"', description: 'Crear alias de comandos' }],
    history: [{ code: 'history', description: 'Mostrar historial de comandos' }],
    export: [{ code: 'export VAR=val', description: 'Establecer variable de entorno' }],
    watch: [{ code: 'watch -n 1 "ls -l"', description: 'Ejecutar programa periódicamente' }],
    screen: [{ code: 'screen', description: 'Multiplexor de terminal' }],
    tmux: [{ code: 'tmux new -s session', description: 'Multiplexor de terminal moderno' }],
    bc: [{ code: 'echo "10+5" | bc', description: 'Calculadora de precisión arbitraria' }]
};

async function callMCP(toolName: string, args: Record<string, unknown> = {}): Promise<MCPResult> {
    return new Promise((resolve, reject) => {
        const proc = spawn(MCP_SERVER_PATH, [], { stdio: ['pipe', 'pipe', 'pipe'] });
        let buffer = '';
        let responseReceived = false;
        let initDone = false;

        proc.stdout.setEncoding('utf8');
        proc.stdout.on('data', (chunk) => {
            buffer += chunk;
            const lines = buffer.split('\n');

            for (let i = 0; i < lines.length - 1; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                try {
                    const resp = JSON.parse(line);

                    if (resp.id === 1 && !initDone) {
                        initDone = true;
                        proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');
                        setTimeout(() => {
                            proc.stdin.write(JSON.stringify({
                                jsonrpc: '2.0', id: 2, method: 'tools/call',
                                params: { name: toolName, arguments: args }
                            }) + '\n');
                        }, 200);
                    }

                    if (resp.id === 2) {
                        responseReceived = true;
                        if (resp.error) reject(new Error(resp.error.message));
                        else resolve(resp.result as MCPResult);
                        proc.kill();
                        return;
                    }
                } catch { }
            }
            buffer = lines[lines.length - 1];
        });

        proc.stderr.on('data', () => { });
        proc.on('error', reject);
        proc.on('close', (code) => {
            if (!responseReceived) {
                try {
                    const resp = JSON.parse(buffer.trim());
                    if (resp.id === 2 && resp.result) { resolve(resp.result as MCPResult); return; }
                } catch { }
                reject(new Error(`MCP closed (code ${code})`));
            }
        });

        proc.stdin.write(JSON.stringify({
            jsonrpc: '2.0', id: 1, method: 'initialize',
            params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'lsearch', version: '1.0' } }
        }) + '\n');

        setTimeout(() => { if (!responseReceived) { proc.kill(); reject(new Error('Timeout 90s')); } }, 90000);
    });
}

function detectCategory(text: string): string {
    const l = text.toLowerCase();
    if (/network|ssh|http|port|ip |tcp|udp|dns|ping|curl|wget|netcat|traceroute/.test(l)) return 'networking';
    if (/security|password|encrypt|scan|hack|exploit|vuln|pentest|crack|firewall|nmap|metasploit|hydra|aircrack|wireshark|forensic/.test(l)) return 'security';
    if (/file|directory|folder|copy|move|delete|find|list|ls |cd |mkdir|rm |cp |mv |touch|ln /.test(l)) return 'files';
    if (/process|pid|kill|cpu|memory|top|htop|ps |free |uptime/.test(l)) return 'process';
    if (/text|string|pattern|grep|sed|awk|regex|cat |less|more|head|tail|cut|sort|uniq/.test(l)) return 'text';
    if (/permission|chmod|chown|access|owner|sudo/.test(l)) return 'permissions';
    if (/disk|storage|mount|partition|df |du /.test(l)) return 'disk';
    if (/user|account|group|login|passwd|useradd/.test(l)) return 'users';
    if (/package|apt|yum|dnf|snap|install/.test(l)) return 'system';
    return 'system';
}

function parseCommands(text: string): CommandData[] {
    const cmds: CommandData[] = [];
    const seen = new Set<string>();

    // Split text into blocks per command to capture examples
    // Pattern: **command**: description followed by examples
    const commandBlockPattern = /\*\s*\*\*([a-zA-Z0-9_\/-]+)(?:\s*\([^)]*\))?\*\*[:\s]*([^\n*]+)(?:\n(?:[ \t]*[-•]\s*[Ee]jemplo[s]?:\s*`([^`]+)`\s*[-–:]?\s*([^\n]*)\n?)*)?/g;

    let m;
    while ((m = commandBlockPattern.exec(text)) !== null) {
        const cmdName = m[1].trim().toLowerCase();
        const desc = m[2].trim();

        // Extract examples that follow this command
        const blockStart = m.index;
        const nextCmdIdx = text.indexOf('\n* **', blockStart + 1);
        const blockEnd = nextCmdIdx > blockStart ? nextCmdIdx : text.length;
        const block = text.substring(blockStart, blockEnd);

        const examples = extractExamples(block);
        addCommandWithExamples(cmdName, desc, examples, cmds, seen);
    }

    // Fallback patterns for commands without examples
    // Pattern: **command**: description (most common in structured response)
    const boldColonPattern = /\*\*([a-zA-Z0-9_-]+)\*\*:\s*([^*\n\[]+)/g;
    while ((m = boldColonPattern.exec(text)) !== null) {
        addCommandWithExamples(m[1], m[2], [], cmds, seen);
    }

    // Pattern: 1. **command**: description (Numbered list)
    const numberedBoldPattern = /^\d+\.\s*\*\*([a-zA-Z0-9_-]+)\*\*[:\s]*([^*\n\[]+)/gm;
    while ((m = numberedBoldPattern.exec(text)) !== null) {
        addCommandWithExamples(m[1], m[2], [], cmds, seen);
    }

    // Pattern: * command: description (Bullet without bold)
    const simpleBulletPattern = /^[\*\-]\s+([a-zA-Z0-9_-]+):[:\s]*([^*\n\[]+)/gm;
    while ((m = simpleBulletPattern.exec(text)) !== null) {
        // Only if it looks like a command (no spaces, lowercase mostly)
        if (!m[1].includes(' ')) {
            addCommandWithExamples(m[1], m[2], [], cmds, seen);
        }
    }

    // Pattern: `command` - description (Backticks)
    const backtickPattern = /`([a-zA-Z0-9_-]+)`\s*[-–:]\s*([^`\n\[]+)/g;
    while ((m = backtickPattern.exec(text)) !== null) {
        addCommandWithExamples(m[1], m[2], [], cmds, seen);
    }

    console.log(`Parsed ${cmds.length} commands`);
    return cmds;
}

function extractExamples(block: string): Array<{ code: string; description: string }> {
    const examples: Array<{ code: string; description: string }> = [];

    // Pattern: - Ejemplo: `command with args` - description
    const examplePattern = /[-•]\s*[Ee]jemplo[s]?:\s*`([^`]+)`\s*[-–:]?\s*([^\n]*)/g;
    let m;
    while ((m = examplePattern.exec(block)) !== null) {
        const code = m[1].trim();
        const description = m[2].trim().replace(/^[-–:\s]+/, '');
        if (code.length > 0) {
            examples.push({ code, description: description || 'Ejemplo de uso' });
        }
    }

    // Alternative pattern: `command` (description)
    const altPattern = /^\s+`([^`]+)`\s*[-–]?\s*([^\n]+)/gm;
    while ((m = altPattern.exec(block)) !== null) {
        const code = m[1].trim();
        const description = m[2].trim();
        // Avoid duplicates
        if (code.length > 0 && !examples.some(e => e.code === code)) {
            examples.push({ code, description: description || 'Ejemplo de uso' });
        }
    }

    return examples.slice(0, 5); // Limit to 5 examples max
}

function addCommandWithExamples(
    cmd: string,
    desc: string,
    examples: Array<{ code: string; description: string }>,
    cmds: CommandData[],
    seen: Set<string>
) {
    const c = cmd.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const d = desc.trim().replace(/\s*\[[\d,\s-]+\]\s*$/, '').replace(/;.*$/, '').trim();

    if (c.length >= 2 && c.length <= 25 && d.length >= 5 && !seen.has(c) && !/^\d+$/.test(c)) {
        seen.add(c);
        cmds.push({
            command: c,
            description: d.substring(0, 400),
            category: detectCategory(c + ' ' + d),
            examples: examples.length > 0 ? examples : [],
            tags: extractTags(c + ' ' + d)
        });
    }
}

function extractTags(text: string): string[] {
    const tags: string[] = [];
    const l = text.toLowerCase();
    const kws = ['network', 'security', 'file', 'process', 'text', 'permission', 'disk', 'user', 'linux', 'bash', 'shell', 'server', 'web', 'http', 'ssh', 'firewall', 'scan', 'pentest', 'docker', 'forensic'];
    for (const k of kws) if (l.includes(k)) tags.push(k);
    return tags.slice(0, 8);
}

async function syncFromNotebook(): Promise<{ inserted: number; updated: number; total: number; errors: string[] }> {
    const errors: string[] = [];

    try {
        console.log('Syncing from NotebookLM (Standard mode)...');

        // Consultar NotebookLM
        const result = await callMCP('notebook_query', {
            notebook_id: NOTEBOOK_ID,
            query: `List all commands and tools mentioned in the sources. For each one, provide the name and a brief description. Return as a list.`
        });

        const rawText = result?.structuredContent?.answer || '';

        // DEBUG: Guardar respuesta cruda
        try {
            const fs = require('fs');
            const logPath = 'C:/Users/volit/Documents/lsearch/notebooklm_debug.log';
            fs.writeFileSync(logPath, `TIMESTAMP: ${new Date().toISOString()}\\nRAW LENGTH: ${rawText.length}\\n\\n${rawText}\\n\\nFULL JSON:\\n${JSON.stringify(result, null, 2)}`);
        } catch (e) { }

        console.log(`DEBUG: Got ${rawText.length} chars from NotebookLM`);

        let commands = parseCommands(rawText);

        // --- FALLBACK LOGIC ---
        // Si no hay respuesta o no se parsearon comandos, usar backup local masivo
        if (!rawText || rawText.length < 50 || commands.length === 0) {
            console.log('NotebookLM returned empty or no commands. Using FALLBACK backup.');

            // Convertir FALLBACK_DATA a CommandData[]
            for (const [cmd, examples] of Object.entries(FALLBACK_DATA)) {
                // Usar la descripción del primer ejemplo como descripción del comando (mejor que nada)
                const description = examples[0]?.description || 'Herramienta de sistema';
                // A veces description es muy corta ("listar"), añadimos el nombre para mejor categorizacion
                const fullText = `${cmd} ${description} ${examples.map(e => e.description).join(' ')}`;

                // Solo añadir si no existe ya
                if (!commands.some(c => c.command === cmd)) {
                    commands.push({
                        command: cmd,
                        description: description,
                        category: detectCategory(fullText),
                        tags: extractTags(fullText),
                        examples: examples
                    });
                }
            }

            if (commands.length > 0) {
                errors.push('Warning: Used local backup commands because NotebookLM returned no data.');
            } else {
                return { inserted: 0, updated: 0, total: 0, errors: ['No data from NotebookLM and fallback failed.'] };
            }
        }

        console.log(`Processing ${commands.length} commands (parsed + fallback)...`);
        console.log(`Inserting commands to Supabase...`);
        let inserted = 0, updated = 0;

        for (const cmd of commands) {
            try {
                // Estrategia:
                // 1. Intentar UPDATE primero. Si el comando ya existe, solo actualizamos campos,
                //    y tenemos cuidado de NO sobrescribir ejemplos si los nuevos están vacíos.

                // Preparamos el objeto de actualización base
                const updatePayload: any = {
                    description: cmd.description,
                    category: cmd.category,
                    tags: cmd.tags,
                    source_notebook_id: NOTEBOOK_ID,
                    updated_at: new Date().toISOString()
                };

                // SOLO actualizamos ejemplos si el nuevo trae ejemplos.
                if (cmd.examples && cmd.examples.length > 0) {
                    updatePayload.examples = cmd.examples;
                }

                // Intentamos update
                const { error: updateError, count } = await supabase
                    .from('commands')
                    .update(updatePayload)
                    .eq('command', cmd.command);

                if (!updateError) {
                    // Vamos a usar upsert para garantizar (por si acaso update no encontró nada y no reportó error)
                    const { error: upsertError } = await supabase
                        .from('commands')
                        .upsert({
                            command: cmd.command,
                            ...updatePayload
                        }, { onConflict: 'command' });

                    if (upsertError) {
                        console.error(`Error upserting ${cmd.command}:`, upsertError.message);
                        errors.push(`${cmd.command}: ${upsertError.message}`);
                    } else {
                        inserted++;
                        console.log(`Success: ${cmd.command}`);
                    }
                } else {
                    errors.push(`${cmd.command}: ${updateError.message}`);
                }

            } catch (e) {
                const msg = e instanceof Error ? e.message : 'Unknown';
                console.error(`Exception upserting ${cmd.command}:`, msg);
                errors.push(`${cmd.command}: ${msg}`);
            }
        }

        console.log(`Done! Inserted: ${inserted}, Errors: ${errors.length}`);
        return { inserted, updated, total: commands.length, errors };
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Sync error:', msg);
        return { inserted: 0, updated: 0, total: 0, errors: [msg] };
    }
}

export async function GET() {
    return NextResponse.json({ success: true, notebookId: NOTEBOOK_ID });
}

export async function POST(request: Request) {
    try {
        const { action, query } = await request.json();

        if (action === 'sync') {
            const stats = await syncFromNotebook();
            return NextResponse.json({
                success: stats.inserted > 0 || stats.updated > 0,
                message: `Synced: ${stats.inserted} new, ${stats.updated} updated`,
                stats
            });
        }

        if (action === 'query') {
            const result = await callMCP('notebook_query', { notebook_id: NOTEBOOK_ID, query: query || 'List commands' });
            return NextResponse.json({ success: true, result });
        }

        if (action === 'test') {
            const result = await callMCP('notebook_query', { notebook_id: NOTEBOOK_ID, query: 'List 5 Linux commands' });
            const text = result?.structuredContent?.answer || '';
            const cmds = parseCommands(text);
            return NextResponse.json({ success: true, rawText: text.substring(0, 2000), parsed: cmds, count: cmds.length });
        }

        return NextResponse.json({ error: 'Use action: sync, query, or test' }, { status: 400 });
    } catch (error) {
        return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Error' }, { status: 500 });
    }
}

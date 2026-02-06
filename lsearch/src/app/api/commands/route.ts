import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Diccionario de ejemplos automáticos para comandos Linux
const COMMAND_EXAMPLES: Record<string, Array<{ code: string; description: string }>> = {
    // Files
    ls: [
        { code: 'ls -la', description: 'Listar todos los archivos con detalles' },
        { code: 'ls -lh /var/log', description: 'Listar con tamaños legibles' }
    ],
    cd: [
        { code: 'cd /var/www', description: 'Cambiar al directorio especificado' },
        { code: 'cd ..', description: 'Subir un nivel en el árbol de directorios' }
    ],
    cp: [
        { code: 'cp archivo.txt backup/', description: 'Copiar archivo a directorio' },
        { code: 'cp -r carpeta/ destino/', description: 'Copiar directorio recursivamente' }
    ],
    mv: [
        { code: 'mv archivo.txt nuevo_nombre.txt', description: 'Renombrar archivo' },
        { code: 'mv archivo.txt /otro/directorio/', description: 'Mover archivo' }
    ],
    rm: [
        { code: 'rm archivo.txt', description: 'Eliminar un archivo' },
        { code: 'rm -rf directorio/', description: 'Eliminar directorio y contenido' }
    ],
    mkdir: [
        { code: 'mkdir nueva_carpeta', description: 'Crear un directorio' },
        { code: 'mkdir -p ruta/anidada/profunda', description: 'Crear directorios anidados' }
    ],
    touch: [
        { code: 'touch archivo.txt', description: 'Crear archivo vacío' },
        { code: 'touch -d "2024-01-01" archivo.txt', description: 'Establecer fecha de modificación' }
    ],
    find: [
        { code: 'find . -name "*.log"', description: 'Buscar archivos por nombre' },
        { code: 'find /var -size +100M', description: 'Buscar archivos mayores a 100MB' }
    ],
    cat: [
        { code: 'cat archivo.txt', description: 'Mostrar contenido del archivo' },
        { code: 'cat archivo1.txt archivo2.txt > combinado.txt', description: 'Concatenar archivos' }
    ],
    // Text
    grep: [
        { code: 'grep "error" /var/log/syslog', description: 'Buscar "error" en archivo' },
        { code: 'grep -r "TODO" --include="*.py"', description: 'Buscar recursivamente en archivos Python' }
    ],
    sed: [
        { code: 'sed "s/antiguo/nuevo/g" archivo.txt', description: 'Reemplazar texto en archivo' },
        { code: 'sed -i "/patron/d" archivo.txt', description: 'Eliminar líneas que contienen patrón' }
    ],
    awk: [
        { code: 'awk \'{print $1}\' archivo.txt', description: 'Imprimir primera columna' },
        { code: 'awk -F: \'{print $1}\' /etc/passwd', description: 'Listar usuarios del sistema' }
    ],
    head: [
        { code: 'head -n 20 archivo.txt', description: 'Mostrar primeras 20 líneas' },
        { code: 'head -c 100 archivo.bin', description: 'Mostrar primeros 100 bytes' }
    ],
    tail: [
        { code: 'tail -f /var/log/syslog', description: 'Seguir log en tiempo real' },
        { code: 'tail -n 50 archivo.log', description: 'Mostrar últimas 50 líneas' }
    ],
    // Network
    ping: [
        { code: 'ping -c 4 google.com', description: 'Probar conectividad (4 paquetes)' },
        { code: 'ping -i 0.5 192.168.1.1', description: 'Ping cada 0.5 segundos' }
    ],
    curl: [
        { code: 'curl -X GET https://api.ejemplo.com/datos', description: 'Hacer petición GET' },
        { code: 'curl -X POST -d "param=valor" https://api.ejemplo.com', description: 'Enviar datos POST' }
    ],
    wget: [
        { code: 'wget https://ejemplo.com/archivo.zip', description: 'Descargar archivo' },
        { code: 'wget -r -np https://sitio.com/directorio/', description: 'Descargar directorio recursivamente' }
    ],
    ssh: [
        { code: 'ssh usuario@servidor.com', description: 'Conectar a servidor remoto' },
        { code: 'ssh -i clave.pem ec2-user@ip', description: 'Conectar con clave privada' }
    ],
    scp: [
        { code: 'scp archivo.txt usuario@servidor:/ruta/', description: 'Copiar archivo a servidor remoto' },
        { code: 'scp -r directorio/ usuario@servidor:/ruta/', description: 'Copiar directorio recursivamente' }
    ],
    netstat: [
        { code: 'netstat -tuln', description: 'Mostrar puertos en escucha' },
        { code: 'netstat -anp | grep :80', description: 'Buscar procesos en puerto 80' }
    ],
    // Security
    nmap: [
        { code: 'nmap -sV 192.168.1.1', description: 'Escanear puertos y detectar servicios' },
        { code: 'nmap -sS -O target.com', description: 'Escaneo SYN con detección de SO' }
    ],
    nikto: [
        { code: 'nikto -h http://target.com', description: 'Escanear vulnerabilidades web' },
        { code: 'nikto -h https://target.com -ssl', description: 'Escanear servidor HTTPS' }
    ],
    hydra: [
        { code: 'hydra -l admin -P wordlist.txt ssh://192.168.1.1', description: 'Ataque de fuerza bruta SSH' },
        { code: 'hydra -L users.txt -P pass.txt ftp://target', description: 'Ataque FTP con listas' }
    ],
    aircrack: [
        { code: 'aircrack-ng -w wordlist.txt capture.cap', description: 'Crackear contraseña WiFi' },
        { code: 'aircrack-ng -b AA:BB:CC:DD:EE:FF capture.cap', description: 'Crackear BSSID específico' }
    ],
    john: [
        { code: 'john --wordlist=rockyou.txt hashes.txt', description: 'Crackear hashes con diccionario' },
        { code: 'john --format=sha512crypt shadow.txt', description: 'Crackear contraseñas Unix' }
    ],
    hashcat: [
        { code: 'hashcat -m 0 -a 0 hashes.txt wordlist.txt', description: 'Crackear MD5 con diccionario' },
        { code: 'hashcat -m 1000 ntlm.txt rockyou.txt', description: 'Crackear NTLM' }
    ],
    metasploit: [
        { code: 'msfconsole -q', description: 'Iniciar Metasploit en modo silencioso' },
        { code: 'msfvenom -p windows/meterpreter/reverse_tcp LHOST=IP LPORT=4444 -f exe > payload.exe', description: 'Generar payload' }
    ],
    burpsuite: [
        { code: 'java -jar burpsuite_community.jar', description: 'Iniciar Burp Suite' }
    ],
    wireshark: [
        { code: 'wireshark -i eth0', description: 'Capturar tráfico en interfaz eth0' },
        { code: 'tshark -r captura.pcap -Y "http"', description: 'Filtrar tráfico HTTP en captura' }
    ],
    sqlmap: [
        { code: 'sqlmap -u "http://target.com/page?id=1"', description: 'Detectar inyección SQL' },
        { code: 'sqlmap -u "URL" --dbs', description: 'Enumerar bases de datos' }
    ],
    dirb: [
        { code: 'dirb http://target.com /usr/share/wordlists/dirb/common.txt', description: 'Escanear directorios web' }
    ],
    gobuster: [
        { code: 'gobuster dir -u http://target.com -w wordlist.txt', description: 'Buscar directorios ocultos' },
        { code: 'gobuster vhost -u http://target.com -w subdominios.txt', description: 'Descubrir virtual hosts' }
    ],
    // Process
    ps: [
        { code: 'ps aux', description: 'Listar todos los procesos' },
        { code: 'ps aux | grep nginx', description: 'Buscar procesos específicos' }
    ],
    top: [
        { code: 'top -u nginx', description: 'Monitorear procesos de un usuario' },
        { code: 'top -p 1234', description: 'Monitorear proceso por PID' }
    ],
    htop: [
        { code: 'htop', description: 'Monitor interactivo de procesos' },
        { code: 'htop -u usuario', description: 'Filtrar por usuario' }
    ],
    kill: [
        { code: 'kill -9 1234', description: 'Forzar terminación de proceso' },
        { code: 'kill -15 $(pgrep nginx)', description: 'Terminar proceso por nombre' }
    ],
    // Permissions
    chmod: [
        { code: 'chmod 755 script.sh', description: 'Dar permisos de ejecución' },
        { code: 'chmod -R 644 directorio/', description: 'Cambiar permisos recursivamente' }
    ],
    chown: [
        { code: 'chown usuario:grupo archivo.txt', description: 'Cambiar propietario y grupo' },
        { code: 'chown -R www-data:www-data /var/www/', description: 'Cambiar propietario recursivamente' }
    ],
    // Disk
    df: [
        { code: 'df -h', description: 'Mostrar uso de disco en formato legible' },
        { code: 'df -T', description: 'Mostrar tipo de sistema de archivos' }
    ],
    du: [
        { code: 'du -sh *', description: 'Tamaño de cada elemento en directorio' },
        { code: 'du -h --max-depth=1 /var', description: 'Tamaño hasta nivel 1' }
    ],
    // System
    systemctl: [
        { code: 'systemctl status nginx', description: 'Ver estado de servicio' },
        { code: 'systemctl restart apache2', description: 'Reiniciar servicio' }
    ],
    journalctl: [
        { code: 'journalctl -u nginx -f', description: 'Ver logs de servicio en tiempo real' },
        { code: 'journalctl --since "1 hour ago"', description: 'Ver logs de la última hora' }
    ],
    tar: [
        { code: 'tar -czvf archivo.tar.gz directorio/', description: 'Comprimir directorio' },
        { code: 'tar -xzvf archivo.tar.gz', description: 'Extraer archivo comprimido' }
    ],
    zip: [
        { code: 'zip -r archivo.zip directorio/', description: 'Comprimir en formato ZIP' },
        { code: 'unzip archivo.zip -d destino/', description: 'Extraer ZIP a directorio' }
    ],
    cron: [
        { code: 'crontab -e', description: 'Editar tareas programadas' },
        { code: 'crontab -l', description: 'Listar tareas del usuario' }
    ],
    docker: [
        { code: 'docker ps -a', description: 'Listar todos los contenedores' },
        { code: 'docker exec -it container_name bash', description: 'Entrar al contenedor' }
    ],
    // Users
    useradd: [
        { code: 'useradd -m -s /bin/bash nuevo_usuario', description: 'Crear usuario con home y bash' },
        { code: 'useradd -G sudo,docker usuario', description: 'Crear usuario en grupos' }
    ],
    passwd: [
        { code: 'passwd usuario', description: 'Cambiar contraseña de usuario' },
        { code: 'passwd -l usuario', description: 'Bloquear cuenta de usuario' }
    ],
    // Additional security tools
    enum4linux: [
        { code: 'enum4linux -a target_ip', description: 'Enumerar información SMB completa' },
        { code: 'enum4linux -U target_ip', description: 'Enumerar usuarios' }
    ],
    maltego: [
        { code: 'maltego', description: 'Iniciar herramienta de OSINT gráfica' }
    ],
    theharvester: [
        { code: 'theHarvester -d domain.com -b google', description: 'Recopilar emails y subdominios' }
    ],
    responder: [
        { code: 'responder -I eth0', description: 'Capturar credenciales LLMNR/NBT-NS' }
    ],
    crackmapexec: [
        { code: 'crackmapexec smb 192.168.1.0/24', description: 'Escanear red para SMB' },
        { code: 'crackmapexec smb target -u user -p pass', description: 'Probar credenciales SMB' }
    ],
    bloodhound: [
        { code: 'neo4j console', description: 'Iniciar base de datos para BloodHound' },
        { code: 'bloodhound', description: 'Iniciar interfaz gráfica' }
    ],
    impacket: [
        { code: 'secretsdump.py domain/user:pass@target', description: 'Extraer hashes de DC' },
        { code: 'psexec.py domain/user:pass@target', description: 'Obtener shell remota' }
    ],
    smbclient: [
        { code: 'smbclient //server/share -U usuario', description: 'Conectar a recurso compartido' },
        { code: 'smbclient -L //server -N', description: 'Listar shares sin credenciales' }
    ],
    rpcclient: [
        { code: 'rpcclient -U "" -N target', description: 'Conexión nula RPC' },
        { code: 'rpcclient -U user target', description: 'Conectar con credenciales' }
    ],
    whatweb: [
        { code: 'whatweb http://target.com', description: 'Identificar tecnologías web' },
        { code: 'whatweb -v http://target.com', description: 'Modo verbose con detalles' }
    ],
    wpscan: [
        { code: 'wpscan --url http://target.com', description: 'Escanear WordPress' },
        { code: 'wpscan --url http://target.com --enumerate u', description: 'Enumerar usuarios WordPress' }
    ]
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const category = searchParams.get('category') || '';

    try {
        let dbQuery = supabase
            .from('commands')
            .select('*')
            .order('command', { ascending: true });

        if (category) {
            dbQuery = dbQuery.eq('category', category);
        }

        if (query) {
            // Using 'or' for simple search across multiple columns
            // Note: textSearch is better but requires specific index setup
            dbQuery = dbQuery.or(`command.ilike.%${query}%,description.ilike.%${query}%`);
        }

        const { data, error } = await dbQuery;

        if (error) throw error;

        return NextResponse.json({
            commands: data || [],
            count: data?.length || 0,
            source: 'supabase-rest'
        });
    } catch (error) {
        console.error('Supabase error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch commands', details: error instanceof Error ? error.message : 'Unknown error', commands: [] },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { command, description, category, subcategory, examples, tags } = body;

        if (!command || !description || !category) {
            return NextResponse.json(
                { error: 'Missing required fields: command, description, category' },
                { status: 400 }
            );
        }

        const { data, error } = await supabase
            .from('commands')
            .upsert({
                command,
                description,
                category,
                subcategory: subcategory || null,
                examples: examples || [],
                tags: tags || [],
                updated_at: new Date().toISOString()
            }, { onConflict: 'command' })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, command: data });
    } catch (error) {
        console.error('Insert error:', error);
        return NextResponse.json(
            { error: 'Failed to insert command', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

// PATCH: Poblar ejemplos automáticos para comandos sin ejemplos
// PATCH: Poblar ejemplos automáticos para comandos sin ejemplos
export async function PATCH() {
    try {
        let updated = 0;
        const updatedCommands: string[] = [];
        const errors: string[] = [];

        console.log('Iniciando actualización masiva de ejemplos...');

        // Iterar sobre nuestro diccionario local y actualizar ciegamente
        // Convertimos a array de promesas para ejecutar en paralelo (teniendo cuidado con rate limits si fueran muchos, pero son ~60)
        const updatePromises = Object.entries(COMMAND_EXAMPLES).map(async ([cmdName, examples]) => {
            try {
                // Actualizamos por nombre de comando
                const { error } = await supabase
                    .from('commands')
                    .update({
                        examples: examples,
                        updated_at: new Date().toISOString()
                    })
                    .eq('command', cmdName);

                // Nota: Sin 'select' permission, data será null, error puede ser null si el update "funcionó" (aunque no actualizara nada si no existe)
                // O puede ser un error de RLS si policy bloquea UPDATE. Asumimos que podemos hacer UPDATE sobre nuestros propios registros o anon key tiene permiso.

                if (error) {
                    return { success: false, name: cmdName, error: error.message };
                } else {
                    return { success: true, name: cmdName };
                }
            } catch (e) {
                return { success: false, name: cmdName, error: e instanceof Error ? e.message : 'Unknown' };
            }
        });

        const results = await Promise.all(updatePromises);

        results.forEach(r => {
            if (r.success) {
                updated++;
                updatedCommands.push(r.name);
            } else {
                if (r.error) errors.push(`${r.name}: ${r.error}`);
            }
        });

        return NextResponse.json({
            success: true,
            message: `Proceso completado. Se enviaron actualizaciones para ${results.length} comandos.`,
            updated_count_estimate: updated,
            updated_commands: updatedCommands,
            errors_count: errors.length,
            errors_sample: errors.slice(0, 5)
        });

    } catch (error) {
        console.error('Patch error:', error);
        return NextResponse.json(
            { error: 'Failed to update examples', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

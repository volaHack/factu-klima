import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const seedCommands = [
    { command: 'ls', description: 'List directory contents', category: 'files', subcategory: 'listing', examples: [{ code: 'ls -la', description: 'List all files including hidden, with details' }, { code: 'ls -lh', description: 'List with human-readable file sizes' }], tags: ['directory', 'list', 'basic'] },
    { command: 'cd', description: 'Change directory', category: 'files', subcategory: 'navigation', examples: [{ code: 'cd ~', description: 'Go to home directory' }, { code: 'cd -', description: 'Go to previous directory' }], tags: ['directory', 'navigation', 'basic'] },
    { command: 'grep', description: 'Search text patterns in files', category: 'text', subcategory: 'search', examples: [{ code: 'grep -r "pattern" .', description: 'Recursive search in current directory' }, { code: 'grep -i "pattern" file.txt', description: 'Case-insensitive search' }], tags: ['search', 'text', 'pattern', 'regex'] },
    { command: 'find', description: 'Search for files in directory hierarchy', category: 'files', subcategory: 'search', examples: [{ code: 'find . -name "*.txt"', description: 'Find all .txt files' }, { code: 'find / -type f -size +100M', description: 'Find files larger than 100MB' }], tags: ['search', 'files', 'directory'] },
    { command: 'chmod', description: 'Change file permissions', category: 'permissions', subcategory: 'modify', examples: [{ code: 'chmod 755 script.sh', description: 'Make script executable' }, { code: 'chmod -R 644 folder/', description: 'Recursively set permissions' }], tags: ['permissions', 'security', 'files'] },
    { command: 'ssh', description: 'Secure Shell - remote login', category: 'networking', subcategory: 'remote', examples: [{ code: 'ssh user@host', description: 'Connect to remote host' }, { code: 'ssh -i key.pem user@host', description: 'Connect using private key' }], tags: ['remote', 'secure', 'connection', 'network'] },
    { command: 'nmap', description: 'Network exploration and security auditing', category: 'security', subcategory: 'scanning', examples: [{ code: 'nmap -sV target', description: 'Version detection scan' }, { code: 'nmap -sS -p 1-1000 target', description: 'SYN stealth scan on ports 1-1000' }], tags: ['security', 'scanning', 'ports', 'network', 'pentesting'] },
    { command: 'netstat', description: 'Network statistics', category: 'networking', subcategory: 'monitoring', examples: [{ code: 'netstat -tulpn', description: 'Show listening ports with process info' }, { code: 'netstat -an', description: 'Show all connections' }], tags: ['network', 'connections', 'ports', 'monitoring'] },
    { command: 'ps', description: 'Report process status', category: 'process', subcategory: 'monitoring', examples: [{ code: 'ps aux', description: 'Show all processes with details' }, { code: 'ps -ef | grep nginx', description: 'Find nginx processes' }], tags: ['process', 'monitoring', 'system'] },
    { command: 'top', description: 'Display Linux processes', category: 'process', subcategory: 'monitoring', examples: [{ code: 'top -d 1', description: 'Update every 1 second' }, { code: 'top -u username', description: 'Show processes for specific user' }], tags: ['process', 'monitoring', 'cpu', 'memory'] },
    { command: 'iptables', description: 'Firewall configuration', category: 'security', subcategory: 'firewall', examples: [{ code: 'iptables -L', description: 'List all rules' }, { code: 'iptables -A INPUT -p tcp --dport 22 -j ACCEPT', description: 'Allow SSH' }], tags: ['firewall', 'security', 'network', 'rules'] },
    { command: 'tcpdump', description: 'Packet analyzer', category: 'security', subcategory: 'traffic', examples: [{ code: 'tcpdump -i eth0', description: 'Capture packets on interface' }, { code: 'tcpdump -w capture.pcap', description: 'Save packets to file' }], tags: ['packets', 'network', 'traffic', 'security', 'analysis'] },
    { command: 'curl', description: 'Transfer data from URLs', category: 'networking', subcategory: 'http', examples: [{ code: 'curl -I https://example.com', description: 'Get HTTP headers only' }, { code: 'curl -X POST -d "data" url', description: 'Send POST request' }], tags: ['http', 'api', 'download', 'web'] },
    { command: 'wget', description: 'Download files from web', category: 'networking', subcategory: 'download', examples: [{ code: 'wget -c url', description: 'Continue interrupted download' }, { code: 'wget -r url', description: 'Recursive download' }], tags: ['download', 'web', 'files'] },
    { command: 'tar', description: 'Archive utility', category: 'files', subcategory: 'compression', examples: [{ code: 'tar -czvf archive.tar.gz folder/', description: 'Create compressed archive' }, { code: 'tar -xzvf archive.tar.gz', description: 'Extract archive' }], tags: ['archive', 'compression', 'backup'] },
    { command: 'systemctl', description: 'Control systemd services', category: 'system', subcategory: 'services', examples: [{ code: 'systemctl status nginx', description: 'Check service status' }, { code: 'systemctl restart apache2', description: 'Restart service' }], tags: ['services', 'systemd', 'daemon', 'control'] },
    { command: 'journalctl', description: 'Query systemd journal', category: 'system', subcategory: 'logs', examples: [{ code: 'journalctl -u nginx', description: 'Show logs for nginx service' }, { code: 'journalctl -f', description: 'Follow logs in real-time' }], tags: ['logs', 'systemd', 'debugging'] },
    { command: 'df', description: 'Report disk space usage', category: 'disk', subcategory: 'monitoring', examples: [{ code: 'df -h', description: 'Human-readable disk usage' }, { code: 'df -i', description: 'Show inode usage' }], tags: ['disk', 'storage', 'space', 'monitoring'] },
    { command: 'du', description: 'Estimate file space usage', category: 'disk', subcategory: 'analysis', examples: [{ code: 'du -sh *', description: 'Size of each item in current directory' }, { code: 'du -h --max-depth=1', description: 'Size of subdirectories' }], tags: ['disk', 'size', 'storage', 'analysis'] },
    { command: 'awk', description: 'Pattern scanning and processing', category: 'text', subcategory: 'processing', examples: [{ code: "awk '{print $1}' file", description: 'Print first column' }, { code: "awk -F: '{print $1}' /etc/passwd", description: 'List usernames' }], tags: ['text', 'processing', 'scripting', 'columns'] },
    { command: 'sed', description: 'Stream editor for filtering and transforming text', category: 'text', subcategory: 'processing', examples: [{ code: "sed 's/old/new/g' file", description: 'Replace all occurrences' }, { code: "sed -i 's/old/new/g' file", description: 'In-place replacement' }], tags: ['text', 'replace', 'editing', 'processing'] },
    { command: 'useradd', description: 'Create a new user', category: 'users', subcategory: 'management', examples: [{ code: 'useradd -m username', description: 'Create user with home directory' }, { code: 'useradd -G sudo username', description: 'Create user in sudo group' }], tags: ['users', 'accounts', 'administration'] },
    { command: 'passwd', description: 'Change user password', category: 'users', subcategory: 'security', examples: [{ code: 'passwd', description: 'Change current user password' }, { code: 'passwd username', description: 'Change another user password (root)' }], tags: ['password', 'security', 'users'] },
    { command: 'crontab', description: 'Schedule periodic tasks', category: 'scripting', subcategory: 'automation', examples: [{ code: 'crontab -e', description: 'Edit cron jobs' }, { code: 'crontab -l', description: 'List cron jobs' }], tags: ['scheduling', 'automation', 'tasks'] },
    { command: 'docker', description: 'Container management', category: 'system', subcategory: 'containers', examples: [{ code: 'docker ps -a', description: 'List all containers' }, { code: 'docker exec -it container bash', description: 'Enter container shell' }], tags: ['containers', 'docker', 'virtualization'] },
    { command: 'git', description: 'Version control system', category: 'scripting', subcategory: 'vcs', examples: [{ code: 'git clone url', description: 'Clone repository' }, { code: 'git log --oneline -10', description: 'Show last 10 commits' }], tags: ['version-control', 'git', 'repository'] },
    { command: 'openssl', description: 'Cryptography toolkit', category: 'security', subcategory: 'encryption', examples: [{ code: 'openssl genrsa -out key.pem 2048', description: 'Generate RSA key' }, { code: 'openssl enc -aes-256-cbc -in file -out file.enc', description: 'Encrypt file' }], tags: ['encryption', 'ssl', 'certificates', 'security'] },
    { command: 'nikto', description: 'Web server scanner', category: 'security', subcategory: 'scanning', examples: [{ code: 'nikto -h target', description: 'Scan web server' }, { code: 'nikto -h target -ssl', description: 'Scan HTTPS server' }], tags: ['web', 'scanning', 'vulnerabilities', 'pentesting'] },
    { command: 'hydra', description: 'Password cracker', category: 'security', subcategory: 'bruteforce', examples: [{ code: 'hydra -l user -P wordlist.txt ssh://target', description: 'SSH brute force' }, { code: 'hydra -L users.txt -P pass.txt ftp://target', description: 'FTP brute force' }], tags: ['password', 'bruteforce', 'cracking', 'pentesting'] },
    { command: 'john', description: 'John the Ripper password cracker', category: 'security', subcategory: 'cracking', examples: [{ code: 'john --wordlist=rockyou.txt hash.txt', description: 'Dictionary attack' }, { code: 'john --show hash.txt', description: 'Show cracked passwords' }], tags: ['password', 'cracking', 'hashes', 'pentesting'] },
    { command: 'hashcat', description: 'Advanced password recovery', category: 'security', subcategory: 'cracking', examples: [{ code: 'hashcat -m 0 hash.txt wordlist.txt', description: 'MD5 dictionary attack' }, { code: 'hashcat -m 1000 hash.txt -a 3 ?a?a?a?a', description: 'NTLM brute force' }], tags: ['password', 'cracking', 'gpu', 'hashes'] },
    { command: 'msfconsole', description: 'Metasploit penetration testing framework', category: 'security', subcategory: 'exploitation', examples: [{ code: 'msfconsole', description: 'Start Metasploit console' }, { code: 'use exploit/multi/handler', description: 'Set up listener' }], tags: ['exploitation', 'pentesting', 'framework', 'hacking'] },
    { command: 'wireshark', description: 'Network protocol analyzer', category: 'security', subcategory: 'traffic', examples: [{ code: 'wireshark -i eth0', description: 'Capture on interface' }, { code: 'tshark -r capture.pcap', description: 'Read pcap file (CLI)' }], tags: ['packets', 'network', 'analysis', 'traffic'] },
    { command: 'aircrack-ng', description: 'WiFi security auditing', category: 'security', subcategory: 'wireless', examples: [{ code: 'airmon-ng start wlan0', description: 'Enable monitor mode' }, { code: 'airodump-ng wlan0mon', description: 'Scan wireless networks' }], tags: ['wifi', 'wireless', 'cracking', 'security'] },
    { command: 'sqlmap', description: 'SQL injection tool', category: 'security', subcategory: 'injection', examples: [{ code: 'sqlmap -u "url?id=1"', description: 'Test for SQL injection' }, { code: 'sqlmap -u url --dbs', description: 'Enumerate databases' }], tags: ['sql', 'injection', 'database', 'pentesting'] },
];

export async function POST() {
    try {
        let inserted = 0;
        let updated = 0;
        const errors: string[] = [];

        for (const cmd of seedCommands) {
            const { error } = await supabase
                .from('commands')
                .upsert({
                    command: cmd.command,
                    description: cmd.description,
                    category: cmd.category,
                    subcategory: cmd.subcategory || null,
                    examples: cmd.examples,
                    tags: cmd.tags,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'command' });

            if (error) {
                errors.push(`${cmd.command}: ${error.message}`);
            } else {
                inserted++;
            }
        }

        return NextResponse.json({
            success: errors.length < seedCommands.length,
            message: `Seeded ${inserted} commands`,
            stats: { inserted, total: seedCommands.length, errors: errors.length },
            errors: errors.slice(0, 5)
        });
    } catch (error) {
        console.error('Seed error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        message: 'Use POST to seed the database',
        commandCount: seedCommands.length
    });
}

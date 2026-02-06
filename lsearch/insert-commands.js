// Insert commands from cached MCP response into Supabase
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://bijtealkyvehtwmwqfsk.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpanRlYWxreXZlaHR3bXdxZnNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNzU2NzQsImV4cCI6MjA4NTk1MTY3NH0.TOQZYBSv3lXumFpCA3-YCnoESUj7FwuETCoolAq_EZs'
);

const NOTEBOOK_ID = '8057d7d3-f20f-46a7-9b65-e04e84110d19';

function detectCategory(text) {
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

function extractTags(text) {
    const tags = [];
    const l = text.toLowerCase();
    const kws = ['network', 'security', 'file', 'process', 'text', 'permission', 'disk', 'user', 'linux', 'bash', 'shell', 'server', 'web', 'http', 'ssh', 'firewall', 'scan', 'pentest', 'docker', 'forensic'];
    for (const k of kws) if (l.includes(k)) tags.push(k);
    return tags.slice(0, 8);
}

function parseCommands(text) {
    const cmds = [];
    const seen = new Set();

    // Pattern: **command**: description
    const patterns = [
        /\*\*([a-zA-Z0-9_-]+)\*\*:\s*([^*\n\[]+)/g,
        /\*\*([a-zA-Z0-9_-]+)\*\*\s*[-–(]\s*([^*\n\[]+)/g,
        /`([a-zA-Z0-9_-]+)`\s*[-–:]\s*([^`\n\[]+)/g,
    ];

    for (const pattern of patterns) {
        let m;
        while ((m = pattern.exec(text)) !== null) {
            const c = m[1].trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
            const d = m[2].trim().replace(/\s*\[[\d,\s-]+\]\s*$/, '').replace(/;.*$/, '').trim();

            if (c.length >= 2 && c.length <= 25 && d.length >= 5 && !seen.has(c) && !/^\d+$/.test(c)) {
                seen.add(c);
                cmds.push({
                    command: c,
                    description: d.substring(0, 400),
                    category: detectCategory(c + ' ' + d),
                    examples: [],
                    tags: extractTags(c + ' ' + d)
                });
            }
        }
    }

    return cmds;
}

async function main() {
    console.log('Reading cached MCP response...');

    const response = JSON.parse(fs.readFileSync('mcp-response.json', 'utf8'));
    const text = response.result?.structuredContent?.answer || '';

    console.log(`Got ${text.length} chars of content`);

    const commands = parseCommands(text);
    console.log(`Parsed ${commands.length} commands`);

    if (commands.length === 0) {
        console.log('No commands found!');
        return;
    }

    let inserted = 0, errors = 0;

    for (const cmd of commands) {
        console.log(`Inserting: ${cmd.command} - ${cmd.description.substring(0, 50)}...`);

        const { error } = await supabase.from('commands').upsert({
            command: cmd.command,
            description: cmd.description,
            category: cmd.category,
            examples: cmd.examples,
            tags: cmd.tags,
            source_notebook_id: NOTEBOOK_ID,
            updated_at: new Date().toISOString()
        }, { onConflict: 'command' });

        if (error) {
            console.error(`  ERROR: ${error.message}`);
            errors++;
        } else {
            console.log(`  OK`);
            inserted++;
        }
    }

    console.log(`\n=== DONE ===`);
    console.log(`Inserted: ${inserted}`);
    console.log(`Errors: ${errors}`);

    // Verify count
    const { count } = await supabase.from('commands').select('*', { count: 'exact', head: true });
    console.log(`Total commands in database: ${count}`);
}

main().catch(console.error);

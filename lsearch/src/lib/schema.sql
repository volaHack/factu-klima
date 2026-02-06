-- LSearch Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Commands table
CREATE TABLE IF NOT EXISTS commands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  command TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  examples JSONB DEFAULT '[]'::jsonb,
  tags TEXT[] DEFAULT '{}',
  source_notebook_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for fast searching
CREATE INDEX IF NOT EXISTS idx_commands_command ON commands USING gin(to_tsvector('english', command));
CREATE INDEX IF NOT EXISTS idx_commands_description ON commands USING gin(to_tsvector('english', description));
CREATE INDEX IF NOT EXISTS idx_commands_category ON commands(category);
CREATE INDEX IF NOT EXISTS idx_commands_tags ON commands USING gin(tags);

-- Full text search function
CREATE OR REPLACE FUNCTION search_commands(search_query TEXT, filter_category TEXT DEFAULT NULL)
RETURNS SETOF commands AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM commands
  WHERE 
    (filter_category IS NULL OR category = filter_category)
    AND (
      search_query IS NULL 
      OR search_query = ''
      OR command ILIKE '%' || search_query || '%'
      OR description ILIKE '%' || search_query || '%'
      OR EXISTS (SELECT 1 FROM unnest(tags) tag WHERE tag ILIKE '%' || search_query || '%')
    )
  ORDER BY 
    CASE WHEN command ILIKE search_query || '%' THEN 0
         WHEN command ILIKE '%' || search_query || '%' THEN 1
         ELSE 2
    END,
    command ASC;
END;
$$ LANGUAGE plpgsql;

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER commands_updated_at
  BEFORE UPDATE ON commands
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Enable Row Level Security (optional, for public read access)
ALTER TABLE commands ENABLE ROW LEVEL SECURITY;

-- Policy for public read access
CREATE POLICY "Allow public read access" ON commands
  FOR SELECT USING (true);

-- Policy for authenticated insert/update (for sync)
CREATE POLICY "Allow service role insert" ON commands
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow service role update" ON commands
  FOR UPDATE USING (true);

-- Insert sample data for testing
INSERT INTO commands (command, description, category, subcategory, examples, tags) VALUES
('ls', 'List directory contents', 'files', 'listing', '[{"code": "ls -la", "description": "List all files including hidden, with details"}, {"code": "ls -lh", "description": "List with human-readable file sizes"}]'::jsonb, ARRAY['directory', 'list', 'basic']),
('cd', 'Change directory', 'files', 'navigation', '[{"code": "cd ~", "description": "Go to home directory"}, {"code": "cd -", "description": "Go to previous directory"}]'::jsonb, ARRAY['directory', 'navigation', 'basic']),
('grep', 'Search text patterns in files', 'text', 'search', '[{"code": "grep -r \"pattern\" .", "description": "Recursive search in current directory"}, {"code": "grep -i \"pattern\" file.txt", "description": "Case-insensitive search"}]'::jsonb, ARRAY['search', 'text', 'pattern', 'regex']),
('find', 'Search for files in directory hierarchy', 'files', 'search', '[{"code": "find . -name \"*.txt\"", "description": "Find all .txt files"}, {"code": "find / -type f -size +100M", "description": "Find files larger than 100MB"}]'::jsonb, ARRAY['search', 'files', 'directory']),
('chmod', 'Change file permissions', 'permissions', 'modify', '[{"code": "chmod 755 script.sh", "description": "Make script executable"}, {"code": "chmod -R 644 folder/", "description": "Recursively set permissions"}]'::jsonb, ARRAY['permissions', 'security', 'files']),
('ssh', 'Secure Shell - remote login', 'networking', 'remote', '[{"code": "ssh user@host", "description": "Connect to remote host"}, {"code": "ssh -i key.pem user@host", "description": "Connect using private key"}]'::jsonb, ARRAY['remote', 'secure', 'connection', 'network']),
('nmap', 'Network exploration and security auditing', 'security', 'scanning', '[{"code": "nmap -sV target", "description": "Version detection scan"}, {"code": "nmap -sS -p 1-1000 target", "description": "SYN stealth scan on ports 1-1000"}]'::jsonb, ARRAY['security', 'scanning', 'ports', 'network', 'pentesting']),
('netstat', 'Network statistics', 'networking', 'monitoring', '[{"code": "netstat -tulpn", "description": "Show listening ports with process info"}, {"code": "netstat -an", "description": "Show all connections"}]'::jsonb, ARRAY['network', 'connections', 'ports', 'monitoring']),
('ps', 'Report process status', 'process', 'monitoring', '[{"code": "ps aux", "description": "Show all processes with details"}, {"code": "ps -ef | grep nginx", "description": "Find nginx processes"}]'::jsonb, ARRAY['process', 'monitoring', 'system']),
('top', 'Display Linux processes', 'process', 'monitoring', '[{"code": "top -d 1", "description": "Update every 1 second"}, {"code": "top -u username", "description": "Show processes for specific user"}]'::jsonb, ARRAY['process', 'monitoring', 'cpu', 'memory']),
('iptables', 'Firewall configuration', 'security', 'firewall', '[{"code": "iptables -L", "description": "List all rules"}, {"code": "iptables -A INPUT -p tcp --dport 22 -j ACCEPT", "description": "Allow SSH"}]'::jsonb, ARRAY['firewall', 'security', 'network', 'rules']),
('tcpdump', 'Packet analyzer', 'security', 'traffic', '[{"code": "tcpdump -i eth0", "description": "Capture packets on interface"}, {"code": "tcpdump -w capture.pcap", "description": "Save packets to file"}]'::jsonb, ARRAY['packets', 'network', 'traffic', 'security', 'analysis']),
('curl', 'Transfer data from URLs', 'networking', 'http', '[{"code": "curl -I https://example.com", "description": "Get HTTP headers only"}, {"code": "curl -X POST -d \"data\" url", "description": "Send POST request"}]'::jsonb, ARRAY['http', 'api', 'download', 'web']),
('wget', 'Download files from web', 'networking', 'download', '[{"code": "wget -c url", "description": "Continue interrupted download"}, {"code": "wget -r url", "description": "Recursive download"}]'::jsonb, ARRAY['download', 'web', 'files']),
('tar', 'Archive utility', 'files', 'compression', '[{"code": "tar -czvf archive.tar.gz folder/", "description": "Create compressed archive"}, {"code": "tar -xzvf archive.tar.gz", "description": "Extract archive"}]'::jsonb, ARRAY['archive', 'compression', 'backup']),
('systemctl', 'Control systemd services', 'system', 'services', '[{"code": "systemctl status nginx", "description": "Check service status"}, {"code": "systemctl restart apache2", "description": "Restart service"}]'::jsonb, ARRAY['services', 'systemd', 'daemon', 'control']),
('journalctl', 'Query systemd journal', 'system', 'logs', '[{"code": "journalctl -u nginx", "description": "Show logs for nginx service"}, {"code": "journalctl -f", "description": "Follow logs in real-time"}]'::jsonb, ARRAY['logs', 'systemd', 'debugging']),
('df', 'Report disk space usage', 'disk', 'monitoring', '[{"code": "df -h", "description": "Human-readable disk usage"}, {"code": "df -i", "description": "Show inode usage"}]'::jsonb, ARRAY['disk', 'storage', 'space', 'monitoring']),
('du', 'Estimate file space usage', 'disk', 'analysis', '[{"code": "du -sh *", "description": "Size of each item in current directory"}, {"code": "du -h --max-depth=1", "description": "Size of subdirectories"}]'::jsonb, ARRAY['disk', 'size', 'storage', 'analysis']),
('awk', 'Pattern scanning and processing', 'text', 'processing', '[{"code": "awk ''{print $1}'' file", "description": "Print first column"}, {"code": "awk -F: ''{print $1}'' /etc/passwd", "description": "List usernames"}]'::jsonb, ARRAY['text', 'processing', 'scripting', 'columns']),
('sed', 'Stream editor for filtering and transforming text', 'text', 'processing', '[{"code": "sed ''s/old/new/g'' file", "description": "Replace all occurrences"}, {"code": "sed -i ''s/old/new/g'' file", "description": "In-place replacement"}]'::jsonb, ARRAY['text', 'replace', 'editing', 'processing']),
('useradd', 'Create a new user', 'users', 'management', '[{"code": "useradd -m username", "description": "Create user with home directory"}, {"code": "useradd -G sudo username", "description": "Create user in sudo group"}]'::jsonb, ARRAY['users', 'accounts', 'administration']),
('passwd', 'Change user password', 'users', 'security', '[{"code": "passwd", "description": "Change current user password"}, {"code": "passwd username", "description": "Change another user password (root)"}]'::jsonb, ARRAY['password', 'security', 'users']),
('cron', 'Schedule periodic tasks', 'scripting', 'automation', '[{"code": "crontab -e", "description": "Edit cron jobs"}, {"code": "crontab -l", "description": "List cron jobs"}]'::jsonb, ARRAY['scheduling', 'automation', 'tasks']),
('docker', 'Container management', 'system', 'containers', '[{"code": "docker ps -a", "description": "List all containers"}, {"code": "docker exec -it container bash", "description": "Enter container shell"}]'::jsonb, ARRAY['containers', 'docker', 'virtualization']),
('git', 'Version control system', 'scripting', 'vcs', '[{"code": "git clone url", "description": "Clone repository"}, {"code": "git log --oneline -10", "description": "Show last 10 commits"}]'::jsonb, ARRAY['version-control', 'git', 'repository']),
('openssl', 'Cryptography toolkit', 'security', 'encryption', '[{"code": "openssl genrsa -out key.pem 2048", "description": "Generate RSA key"}, {"code": "openssl enc -aes-256-cbc -in file -out file.enc", "description": "Encrypt file"}]'::jsonb, ARRAY['encryption', 'ssl', 'certificates', 'security']),
('nikto', 'Web server scanner', 'security', 'scanning', '[{"code": "nikto -h target", "description": "Scan web server"}, {"code": "nikto -h target -ssl", "description": "Scan HTTPS server"}]'::jsonb, ARRAY['web', 'scanning', 'vulnerabilities', 'pentesting']),
('hydra', 'Password cracker', 'security', 'bruteforce', '[{"code": "hydra -l user -P wordlist.txt ssh://target", "description": "SSH brute force"}, {"code": "hydra -L users.txt -P pass.txt ftp://target", "description": "FTP brute force"}]'::jsonb, ARRAY['password', 'bruteforce', 'cracking', 'pentesting']),
('john', 'John the Ripper password cracker', 'security', 'cracking', '[{"code": "john --wordlist=rockyou.txt hash.txt", "description": "Dictionary attack"}, {"code": "john --show hash.txt", "description": "Show cracked passwords"}]'::jsonb, ARRAY['password', 'cracking', 'hashes', 'pentesting']),
('hashcat', 'Advanced password recovery', 'security', 'cracking', '[{"code": "hashcat -m 0 hash.txt wordlist.txt", "description": "MD5 dictionary attack"}, {"code": "hashcat -m 1000 hash.txt -a 3 ?a?a?a?a", "description": "NTLM brute force"}]'::jsonb, ARRAY['password', 'cracking', 'gpu', 'hashes']),
('metasploit', 'Penetration testing framework', 'security', 'exploitation', '[{"code": "msfconsole", "description": "Start Metasploit console"}, {"code": "use exploit/multi/handler", "description": "Set up listener"}]'::jsonb, ARRAY['exploitation', 'pentesting', 'framework', 'hacking']),
('wireshark', 'Network protocol analyzer', 'security', 'traffic', '[{"code": "wireshark -i eth0", "description": "Capture on interface"}, {"code": "tshark -r capture.pcap", "description": "Read pcap file (CLI)"}]'::jsonb, ARRAY['packets', 'network', 'analysis', 'traffic']),
('aircrack-ng', 'WiFi security auditing', 'security', 'wireless', '[{"code": "airmon-ng start wlan0", "description": "Enable monitor mode"}, {"code": "airodump-ng wlan0mon", "description": "Scan wireless networks"}]'::jsonb, ARRAY['wifi', 'wireless', 'cracking', 'security']),
('burpsuite', 'Web application security testing', 'security', 'web', '[{"code": "java -jar burpsuite.jar", "description": "Start Burp Suite"}, {"code": "Configure proxy 127.0.0.1:8080", "description": "Set browser proxy"}]'::jsonb, ARRAY['web', 'proxy', 'security', 'testing']),
('sqlmap', 'SQL injection tool', 'security', 'injection', '[{"code": "sqlmap -u \"url?id=1\"", "description": "Test for SQL injection"}, {"code": "sqlmap -u url --dbs", "description": "Enumerate databases"}]'::jsonb, ARRAY['sql', 'injection', 'database', 'pentesting'])
ON CONFLICT DO NOTHING;

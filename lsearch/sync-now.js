// Sync commands from NotebookLM in Spanish
const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/notebooklm',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', data);
    });
});

req.on('error', (e) => {
    console.error('Error:', e.message);
});

req.write(JSON.stringify({ action: 'sync' }));
req.end();

console.log('Syncing... (this may take up to 90 seconds)');

// Test MCP and show full response
const { spawn } = require('child_process');
const fs = require('fs');

const NOTEBOOK_ID = '03df5b37-f1ea-40d5-b9c2-79a20a047a43';
const MCP_PATH = 'C:/Users/volit/AppData/Roaming/Python/Python312/Scripts/notebooklm-mcp.exe';

async function testMCP() {
    return new Promise((resolve, reject) => {
        console.log('Starting MCP...');
        const proc = spawn(MCP_PATH, [], { stdio: ['pipe', 'pipe', 'pipe'] });

        let buffer = '';
        let initDone = false;
        let responseReceived = false;

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
                        console.log('Init done');
                        proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');
                        setTimeout(() => {
                            console.log('Sending query...');
                            proc.stdin.write(JSON.stringify({
                                jsonrpc: '2.0',
                                id: 2,
                                method: 'tools/call',
                                params: {
                                    name: 'notebook_query',
                                    arguments: {
                                        notebook_id: NOTEBOOK_ID,
                                        query: 'List all commands and tools'
                                    }
                                }
                            }) + '\n');
                        }, 200);
                    }

                    if (resp.id === 2) {
                        responseReceived = true;

                        // Save full response to file
                        fs.writeFileSync('mcp-response.json', JSON.stringify(resp, null, 2));
                        console.log('\n=== FULL RESPONSE SAVED TO mcp-response.json ===\n');

                        // Show key parts
                        console.log('Has error:', !!resp.error);
                        console.log('Has result:', !!resp.result);

                        if (resp.result) {
                            console.log('Result keys:', Object.keys(resp.result));

                            if (resp.result.content) {
                                console.log('Content length:', resp.result.content.length);
                                console.log('Content[0] type:', typeof resp.result.content[0]);
                                console.log('Content[0] keys:', Object.keys(resp.result.content[0]));

                                if (resp.result.content[0].text) {
                                    console.log('\n=== TEXT (first 3000 chars) ===');
                                    console.log(resp.result.content[0].text.substring(0, 3000));
                                }
                            }
                        }

                        proc.kill();
                        resolve(resp);
                    }
                } catch (e) {
                    // Not complete JSON
                }
            }
            buffer = lines[lines.length - 1];
        });

        proc.stderr.on('data', () => { });
        proc.on('error', reject);
        proc.on('close', (code) => {
            if (!responseReceived) {
                // Try final buffer
                try {
                    const resp = JSON.parse(buffer.trim());
                    if (resp.id === 2) {
                        fs.writeFileSync('mcp-response.json', JSON.stringify(resp, null, 2));
                        console.log('Response saved from final buffer');
                        resolve(resp);
                        return;
                    }
                } catch { }
                reject(new Error(`No response, code ${code}`));
            }
        });

        proc.stdin.write(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'test', version: '1.0' }
            }
        }) + '\n');

        setTimeout(() => {
            if (!responseReceived) {
                proc.kill();
                reject(new Error('Timeout 120s'));
            }
        }, 120000);
    });
}

testMCP().then(() => {
    console.log('\nDone!');
    process.exit(0);
}).catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});

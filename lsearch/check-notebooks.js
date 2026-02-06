const { spawn } = require('child_process');

// Ruta al ejecutable MCP
const MCP_PATH = 'C:/Users/volit/AppData/Roaming/Python/Python312/Scripts/notebooklm-mcp.exe';

function callMCP(tool, args = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn(MCP_PATH, [], { stdio: ['pipe', 'pipe', 'pipe'] });
        let buffer = '';
        let initDone = false;
        let responseReceived = false;

        proc.stdout.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Guardar remanente

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const msg = JSON.parse(line);

                    // Paso 1: Inicialización
                    if (msg.id === 1 && !initDone) {
                        initDone = true;
                        // Responder que estamos inicializados
                        proc.stdin.write(JSON.stringify({
                            jsonrpc: '2.0',
                            method: 'notifications/initialized',
                            params: {}
                        }) + '\n');

                        // Paso 2: Ejecutar herramienta
                        setTimeout(() => {
                            console.log(`Llamando a tool: ${tool}...`);
                            proc.stdin.write(JSON.stringify({
                                jsonrpc: '2.0',
                                id: 2,
                                method: 'tools/call',
                                params: { name: tool, arguments: args }
                            }) + '\n');
                        }, 500);
                    }

                    // Paso 3: Recibir resultado
                    if (msg.id === 2) {
                        responseReceived = true;
                        if (msg.error) reject(msg.error);
                        else resolve(msg.result);
                        proc.kill();
                    }
                } catch (e) { }
            }
        });

        // Enviar handshake inicial
        proc.stdin.write(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'diagnostic', version: '1.0' }
            }
        }) + '\n');

        setTimeout(() => {
            if (!responseReceived) {
                proc.kill();
                reject('Timeout');
            }
        }, 10000);
    });
}

async function main() {
    try {
        console.log('Verificando cuadernos disponibles...');
        const result = await callMCP('list_notebooks');

        console.log('\n--- RESULTADO ---');
        if (result.content && result.content[0].text) {
            const data = JSON.parse(result.content[0].text);
            console.log(JSON.stringify(data, null, 2));
        } else {
            console.log('Respuesta cruda:', JSON.stringify(result, null, 2));
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

main();

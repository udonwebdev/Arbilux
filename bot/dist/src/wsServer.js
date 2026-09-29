import { WebSocketServer, WebSocket } from 'ws';
export class TelemetryBroadcaster {
    wss;
    clients = new Set();
    constructor(port = 8545) {
        this.wss = new WebSocketServer({ port });
        this.wss.on('connection', (ws) => {
            this.clients.add(ws);
            console.log(`[WS] Client connected to telemetry stream. Total active: ${this.clients.size}`);
            ws.on('close', () => {
                this.clients.delete(ws);
                console.log(`[WS] Client disconnected. Total active: ${this.clients.size}`);
            });
            ws.on('error', (err) => {
                console.error('[WS ERROR]', err);
                this.clients.delete(ws);
            });
        });
        console.log(`[GUI STREAM] Telemetry WebSocket server running on ws://localhost:${port}`);
    }
    broadcast(payload) {
        const data = JSON.stringify(payload);
        for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        }
    }
    getActiveClientCount() {
        return this.clients.size;
    }
}

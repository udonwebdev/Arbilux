import { WebSocketServer, WebSocket } from 'ws';

export interface TelemetryPayload {
  timestamp: number;
  pair: string;
  uniPrice: number;
  sushiPrice: number;
  spreadBps: number;
  optimalInputWeth: string;
  projectedProfitWeth: string;
  isExecuting: boolean;
  circuitBreakerTripped: boolean;
  recentTx: {
    hash: string;
    profit: string;
    lender: string;
    status: string;
    time: string;
  }[];
}

export class TelemetryBroadcaster {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();

  constructor(port: number = 8545) {
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws: WebSocket) => {
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

  public broadcast(payload: TelemetryPayload) {
    const data = JSON.stringify(payload);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  public getActiveClientCount(): number {
    return this.clients.size;
  }
}

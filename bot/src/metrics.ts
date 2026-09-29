export interface MetricEvent {
  timestamp: string;
  type: 'DISLOCATION' | 'SIMULATION' | 'EXECUTION' | 'REVERT';
  pair: string;
  spreadBps?: number;
  borrowAmount?: string;
  profitNet?: string;
  txHash?: string;
  latencyMs?: number;
}

export class TelemetryLogger {
  public static log(event: MetricEvent) {
    const payload = JSON.stringify({
      ...event,
      timestamp: new Date().toISOString()
    });
    // Standard structured stdout stream for ingestion (Datadog / Prometheus / Loki)
    console.log(`[METRICS] ${payload}`);
  }
}

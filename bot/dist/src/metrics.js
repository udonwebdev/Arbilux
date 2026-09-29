export class TelemetryLogger {
    static log(event) {
        const payload = JSON.stringify({
            ...event,
            timestamp: new Date().toISOString()
        });
        // Standard structured stdout stream for ingestion (Datadog / Prometheus / Loki)
        console.log(`[METRICS] ${payload}`);
    }
}

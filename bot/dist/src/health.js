import http from 'http';
export function startHealthServer(port = 8080, getStatus) {
    const server = http.createServer((req, res) => {
        if (req.url === '/health' || req.url === '/') {
            const status = getStatus();
            const isHealthy = status.active && !status.circuitBreakerTripped;
            res.writeHead(isHealthy ? 200 : 503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: isHealthy ? 'UP' : 'DEGRADED',
                timestamp: new Date().toISOString(),
                uptimeSeconds: Math.floor(process.uptime()),
                memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                metrics: status,
            }, null, 2));
        }
        else {
            res.writeHead(404);
            res.end();
        }
    });
    server.listen(port, () => {
        console.log(`[HEALTHCHECK] Telemetry probe listening on http://0.0.0.0:${port}/health`);
    });
    return server;
}

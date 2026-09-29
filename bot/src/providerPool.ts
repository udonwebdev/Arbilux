import { ethers, JsonRpcProvider } from 'ethers';

export interface EndpointStatus {
  url: string;
  latencyMs: number;
  isHealthy: boolean;
  lastChecked: number;
}

export class LatencyRacerPool {
  private endpoints: string[];
  private providers: Map<string, JsonRpcProvider> = new Map();
  private statuses: Map<string, EndpointStatus> = new Map();
  private activeProviderUrl: string;

  constructor(endpoints: string[]) {
    if (endpoints.length === 0) {
      throw new Error('LatencyRacerPool requires at least one RPC endpoint.');
    }
    this.endpoints = endpoints;
    this.activeProviderUrl = endpoints[0];

    for (const url of endpoints) {
      this.providers.set(url, new JsonRpcProvider(url, undefined, { staticNetwork: true }));
      this.statuses.set(url, {
        url,
        latencyMs: 9999,
        isHealthy: true,
        lastChecked: 0,
      });
    }

    this.benchmarkEndpoints();
    // Re-check latency profile every 30 seconds
    setInterval(() => this.benchmarkEndpoints(), 30_000);
  }

  public async benchmarkEndpoints(): Promise<void> {
    const checks = this.endpoints.map(async (url) => {
      const provider = this.providers.get(url)!;
      const start = Date.now();
      try {
        await provider.getBlockNumber();
        const latency = Date.now() - start;
        this.statuses.set(url, {
          url,
          latencyMs: latency,
          isHealthy: true,
          lastChecked: Date.now(),
        });
      } catch (err) {
        this.statuses.set(url, {
          url,
          latencyMs: 9999,
          isHealthy: false,
          lastChecked: Date.now(),
        });
      }
    });

    await Promise.all(checks);

    // Pick healthy endpoint with lowest latency
    let bestUrl = this.activeProviderUrl;
    let minLatency = 99999;

    for (const [url, stat] of this.statuses.entries()) {
      if (stat.isHealthy && stat.latencyMs < minLatency) {
        minLatency = stat.latencyMs;
        bestUrl = url;
      }
    }

    if (bestUrl !== this.activeProviderUrl) {
      console.log(`[RPC POOL] Switching active provider to fastest node: ${bestUrl} (${minLatency}ms)`);
      this.activeProviderUrl = bestUrl;
    }
  }

  public getPrimaryProvider(): JsonRpcProvider {
    return this.providers.get(this.activeProviderUrl)!;
  }

  public getStatusReport(): EndpointStatus[] {
    return Array.from(this.statuses.values());
  }
}

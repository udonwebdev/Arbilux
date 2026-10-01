import http from 'http';
import https from 'https';
import { performance } from 'perf_hooks';

interface LatencyTarget {
  name: string;
  url: string;
}

const TARGETS: LatencyTarget[] = [
  { name: 'Arbitrum Sequencer Feed', url: 'https://arb1.arbitrum.io/rpc' },
  { name: 'Titan Block Builder (Ashburn)', url: 'https://rpc.titanbuilder.xyz' },
  { name: 'Alchemy Arbitrum Node', url: 'https://arb-mainnet.g.alchemy.com/v2/alch_9xPmo53icKcojfg6xFLSA' },
  { name: 'LlamaNodes Arbitrum', url: 'https://arbitrum.llamarpc.com' },
];

async function measureHttpLatency(name: string, targetUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const urlObj = new URL(targetUrl);
    const client = urlObj.protocol === 'https:' ? https : http;

    const start = performance.now();
    const req = client.request(
      urlObj,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 3000,
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => {
          const duration = performance.now() - start;
          resolve(duration);
        });
      }
    );

    req.on('error', () => {
      resolve(-1);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(-1);
    });

    // Send minimal JSON-RPC eth_blockNumber ping
    req.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }));
    req.end();
  });
}

async function runBenchmark() {
  console.log('================================================================================');
  console.log('       ARBILUX QUANT SYSTEMS - INFRASTRUCTURE PHYSICAL LATENCY PROFILER        ');
  console.log('================================================================================\n');

  for (const target of TARGETS) {
    const samples: number[] = [];
    for (let i = 0; i < 3; i++) {
      const ms = await measureHttpLatency(target.name, target.url);
      if (ms > 0) samples.push(ms);
    }

    if (samples.length > 0) {
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      const min = Math.min(...samples);
      const isColocated = min < 10;

      const badge = isColocated
        ? '\x1b[32m[SUB-10MS COLOCATED / OPTIMAL]\x1b[0m'
        : '\x1b[33m[RESIDENTIAL / REMOTE TRANSIT]\x1b[0m';

      console.log(`Endpoint: \x1b[1m${target.name.padEnd(32)}\x1b[0m`);
      console.log(`  Target:  ${target.url}`);
      console.log(`  Ping:    Min: ${min.toFixed(2)} ms | Avg: ${avg.toFixed(2)} ms  ${badge}\n`);
    } else {
      console.log(`Endpoint: \x1b[1m${target.name.padEnd(32)}\x1b[0m`);
      console.log(`  Status:  \x1b[31m[UNREACHABLE / TIMEOUT]\x1b[0m\n`);
    }
  }

  console.log('================================================================================');
  console.log('Colocation Target: AWS us-east-1 (N. Virginia) -> Titan Ashburn & Nitro Sequencer');
  console.log('Theoretical Fiber Transit in us-east-1: 1.2 ms - 3.5 ms');
  console.log('================================================================================');
}

runBenchmark();

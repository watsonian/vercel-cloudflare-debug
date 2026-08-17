import type { ProbeResult } from "./types";

export class Semaphore {
  private queue: (() => void)[] = [];
  private active = 0;

  constructor(private concurrency: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

export interface ProbeConfig {
  timeout: number;
  keepalive: boolean;
  egressIp: boolean;
}

type Runtime = "https" | "fetch";

function buildProbeUrl(runtime: Runtime, config: ProbeConfig): string {
  const params = new URLSearchParams({ timeout: String(config.timeout) });
  if (runtime === "https") {
    params.set("keepalive", String(config.keepalive));
  }
  if (config.egressIp) {
    params.set("egressIp", "true");
  }
  return `/api/probe/${runtime}?${params}`;
}

async function singleProbe(runtime: Runtime, config: ProbeConfig): Promise<ProbeResult> {
  const url = buildProbeUrl(runtime, config);
  try {
    const res = await fetch(url);
    return await res.json();
  } catch (err) {
    return {
      id: crypto.randomUUID(),
      runtime,
      timestamp: new Date().toISOString(),
      request: { url, timeout: config.timeout },
      success: false,
      error: {
        code: "PROBE_FETCH_ERROR",
        message: err instanceof Error ? err.message : String(err),
        phase: "unknown",
      },
      response: null,
      timing: { dns: null, connect: null, tls: null, ttfb: 0, total: 0 },
      socket: null,
      cf: { ray: null, colo: null, mitigated: null },
      vercel: { region: null, requestId: null, hostname: null, egressIp: null },
    };
  }
}

export async function runBurst(
  runtimes: Runtime[],
  count: number,
  concurrency: number,
  config: ProbeConfig,
  onResult: (result: ProbeResult) => void
): Promise<void> {
  const sem = new Semaphore(concurrency);
  const tasks: Promise<void>[] = [];

  for (let i = 0; i < count; i++) {
    for (const runtime of runtimes) {
      const task = async () => {
        await sem.acquire();
        try {
          const result = await singleProbe(runtime, config);
          onResult(result);
        } finally {
          sem.release();
        }
      };
      tasks.push(task());
    }
  }

  await Promise.all(tasks);
}

export function startPolling(
  runtimes: Runtime[],
  intervalMs: number,
  config: ProbeConfig,
  onResult: (result: ProbeResult) => void
): () => void {
  let stopped = false;

  const poll = async () => {
    if (stopped) return;
    for (const runtime of runtimes) {
      if (stopped) return;
      try {
        const result = await singleProbe(runtime, config);
        onResult(result);
      } catch {
        // fetch to our own route failed
      }
    }
  };

  poll();
  const id = setInterval(poll, intervalMs);

  return () => {
    stopped = true;
    clearInterval(id);
  };
}

const STORAGE_KEY = "doppler-probe-results";
const MAX_STORED_RESULTS = 5000;

export function loadPersistedResults(): ProbeResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ProbeResult[];
  } catch {
    return [];
  }
}

export function persistResults(results: ProbeResult[]): void {
  try {
    const trimmed = results.length > MAX_STORED_RESULTS
      ? results.slice(results.length - MAX_STORED_RESULTS)
      : results;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage full or unavailable
  }
}

export function clearPersistedResults(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

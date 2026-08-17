export interface ProbeBase {
  id: string;
  runtime: "https" | "fetch";
  timestamp: string;

  request: {
    url: string;
    timeout: number;
  };

  timing: {
    dns: number | null;
    connect: number | null;
    tls: number | null;
    ttfb: number;
    total: number;
  };

  socket: {
    remoteAddress: string;
    remotePort: number;
    localPort: number;
    reused: boolean;
  } | null;

  cf: {
    ray: string | null;
    colo: string | null;
    mitigated: string | null;
  } | null;

  vercel: {
    region: string | null;
    requestId: string | null;
    hostname: string | null;
    egressIp: string | null;
  };
}

export interface ProbeSuccess extends ProbeBase {
  success: true;
  error: null;
  response: {
    status: number;
    headers: Record<string, string>;
  };
}

export interface ProbeFailure extends ProbeBase {
  success: false;
  error: {
    code: string;
    message: string;
    phase: "dns" | "connect" | "tls" | "request" | "response" | "unknown";
  };
  response: {
    status: number;
    headers: Record<string, string>;
  } | null;
}

export type ProbeResult = ProbeSuccess | ProbeFailure;

export type ErrorPhase = ProbeFailure["error"]["phase"];

export interface ExportMetadata {
  exportedAt: string;
  totalRequests: number;
  successCount: number;
  failureCount: number;
  runtimeBreakdown: {
    https: number;
    fetch: number;
  };
  testDuration: {
    first: string;
    last: string;
    durationMs: number;
  } | null;
}

export interface ExportPayload {
  metadata: ExportMetadata;
  results: ProbeResult[];
}

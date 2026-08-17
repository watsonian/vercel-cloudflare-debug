import { NextRequest, NextResponse } from "next/server";
import { subscribe, unsubscribe } from "node:diagnostics_channel";
import { classifyEdgeError, extractCfMetadata } from "@/app/lib/classify";
import { getVercelMeta } from "@/app/lib/vercel-meta";
import type { ProbeResult } from "@/app/lib/types";

const DOPPLER_URL = "https://api.doppler.com/v3/configs/config/secrets/download?format=json";

export async function GET(request: NextRequest): Promise<NextResponse<ProbeResult>> {
  const searchParams = request.nextUrl.searchParams;
  const timeout = parseInt(searchParams.get("timeout") ?? "30000", 10);
  const egressIp = searchParams.get("egressIp") === "true";
  const vercel = await getVercelMeta(request.headers, { egressIp });

  const token = process.env.DOPPLER_TOKEN;
  if (!token) {
    return NextResponse.json({
      id: crypto.randomUUID(),
      runtime: "fetch",
      timestamp: new Date().toISOString(),
      request: { url: DOPPLER_URL, timeout },
      success: false,
      error: { code: "CONFIG_ERROR", message: "DOPPLER_TOKEN not set", phase: "unknown" },
      response: null,
      timing: { dns: null, connect: null, tls: null, ttfb: 0, total: 0 },
      socket: null,
      cf: null,
      vercel,
    } satisfies ProbeResult);
  }

  // Sniff socket info from undici's diagnostics channel
  let socketInfo: ProbeResult["socket"] = null;
  let reused = true; // assume reused unless we see a fresh connect

  const onConnected = (msg: unknown) => {
    const { socket } = msg as { socket: { remoteAddress: string; remotePort: number; localPort: number } };
    if (socket) {
      reused = false;
      socketInfo = {
        remoteAddress: socket.remoteAddress ?? "",
        remotePort: socket.remotePort ?? 0,
        localPort: socket.localPort ?? 0,
        reused: false,
      };
    }
  };

  const onHeaders = (msg: unknown) => {
    // If we got headers without a new connection, the socket was reused.
    // Grab socket info from the request's socket if available.
    if (!socketInfo) {
      const { request: req } = msg as { request: { socket?: { remoteAddress: string; remotePort: number; localPort: number } } };
      const sock = req?.socket;
      if (sock) {
        socketInfo = {
          remoteAddress: sock.remoteAddress ?? "",
          remotePort: sock.remotePort ?? 0,
          localPort: sock.localPort ?? 0,
          reused: true,
        };
      }
    }
  };

  subscribe("undici:client:connected", onConnected);
  subscribe("undici:request:headers", onHeaders);

  const startTime = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(DOPPLER_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    // Measure TTFB by reading first chunk from body stream
    let ttfb = performance.now() - startTime;
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    if (reader) {
      const firstRead = await reader.read();
      ttfb = performance.now() - startTime;
      if (firstRead.value) chunks.push(firstRead.value);

      // Consume remaining body
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
    }
    const total = performance.now() - startTime;

    clearTimeout(timeoutId);
    unsubscribe("undici:client:connected", onConnected);
    unsubscribe("undici:request:headers", onHeaders);

    const rawHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      rawHeaders[key] = value;
    });

    const cf = extractCfMetadata(rawHeaders);

    const result: ProbeResult = {
      id: crypto.randomUUID(),
      runtime: "fetch",
      timestamp: new Date().toISOString(),
      request: { url: DOPPLER_URL, timeout },
      success: true,
      error: null,
      response: { status: res.status, headers: rawHeaders },
      timing: {
        dns: null,
        connect: null,
        tls: null,
        ttfb: Math.round(ttfb * 100) / 100,
        total: Math.round(total * 100) / 100,
      },
      socket: socketInfo,
      cf,
      vercel,
    };

    return NextResponse.json(result);
  } catch (err) {
    clearTimeout(timeoutId);
    unsubscribe("undici:client:connected", onConnected);
    unsubscribe("undici:request:headers", onHeaders);

    const total = performance.now() - startTime;
    const error = err instanceof Error ? err : new Error(String(err));

    let classified;
    if (controller.signal.aborted) {
      classified = { code: "ETIMEDOUT", message: "Request timed out", phase: "unknown" as const };
    } else {
      classified = classifyEdgeError(error as Error & { cause?: { code?: string } });
    }

    const result: ProbeResult = {
      id: crypto.randomUUID(),
      runtime: "fetch",
      timestamp: new Date().toISOString(),
      request: { url: DOPPLER_URL, timeout },
      success: false,
      error: classified,
      response: null,
      timing: {
        dns: null,
        connect: null,
        tls: null,
        ttfb: 0,
        total: Math.round(total * 100) / 100,
      },
      socket: socketInfo,
      cf: null,
      vercel,
    };

    return NextResponse.json(result);
  }
}

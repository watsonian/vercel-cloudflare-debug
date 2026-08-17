import { NextRequest, NextResponse } from "next/server";
import https from "node:https";
import { randomUUID } from "node:crypto";
import { classifyNodeError, extractCfMetadata } from "@/app/lib/classify";
import { getVercelMeta } from "@/app/lib/vercel-meta";
import type { ProbeResult } from "@/app/lib/types";

const DOPPLER_URL = "https://api.doppler.com/v3/configs/config/secrets/download?format=json";

export async function GET(request: NextRequest): Promise<NextResponse<ProbeResult>> {
  const searchParams = request.nextUrl.searchParams;
  const timeout = parseInt(searchParams.get("timeout") ?? "30000", 10);
  const keepalive = searchParams.get("keepalive") !== "false";
  const egressIp = searchParams.get("egressIp") === "true";
  const vercel = await getVercelMeta(request.headers, { egressIp });

  const token = process.env.DOPPLER_TOKEN;
  if (!token) {
    return NextResponse.json({
      id: randomUUID(),
      runtime: "https",
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

  // Each Vercel serverless invocation handles one request, so agent-level connection
  // reuse won't occur across invocations. The keepAlive setting here controls the
  // Connection header sent to the origin, which is still diagnostically relevant.
  const agent = new https.Agent({ keepAlive: keepalive });
  const startTime = performance.now();

  return new Promise<NextResponse<ProbeResult>>((resolve) => {
    let dnsTime: number | null = null;
    let connectTime: number | null = null;
    let tlsTime: number | null = null;
    let ttfbTime = 0;

    let gotSocket = false;
    let gotSecureConnect = false;
    let gotResponse = false;

    let socketInfo: ProbeResult["socket"] = null;

    const url = new URL(DOPPLER_URL);

    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: "GET",
        agent,
        timeout,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
      (res) => {
        gotResponse = true;
        ttfbTime = performance.now() - startTime;

        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const totalTime = performance.now() - startTime;
          const rawHeaders: Record<string, string> = {};
          const headerKeys = Object.keys(res.headers);
          for (const key of headerKeys) {
            const val = res.headers[key];
            rawHeaders[key] = Array.isArray(val) ? val.join(", ") : val ?? "";
          }

          const cf = extractCfMetadata(rawHeaders);

          const result: ProbeResult = {
            id: randomUUID(),
            runtime: "https",
            timestamp: new Date().toISOString(),
            request: { url: DOPPLER_URL, timeout },
            success: true,
            error: null,
            response: { status: res.statusCode ?? 0, headers: rawHeaders },
            timing: {
              dns: dnsTime,
              connect: connectTime,
              tls: tlsTime,
              ttfb: Math.round(ttfbTime * 100) / 100,
              total: Math.round(totalTime * 100) / 100,
            },
            socket: socketInfo,
            cf,
            vercel,
          };

          agent.destroy();
          resolve(NextResponse.json(result));
        });

        res.on("error", (err: Error & { code?: string }) => {
          const totalTime = performance.now() - startTime;
          const classified = classifyNodeError(err, { gotResponse, gotSocket, gotSecureConnect });

          const result: ProbeResult = {
            id: randomUUID(),
            runtime: "https",
            timestamp: new Date().toISOString(),
            request: { url: DOPPLER_URL, timeout },
            success: false,
            error: classified,
            response: null,
            timing: {
              dns: dnsTime,
              connect: connectTime,
              tls: tlsTime,
              ttfb: ttfbTime,
              total: Math.round(totalTime * 100) / 100,
            },
            socket: socketInfo,
            cf: null,
            vercel,
          };

          agent.destroy();
          resolve(NextResponse.json(result));
        });
      }
    );

    req.on("socket", (socket) => {
      gotSocket = true;
      const reused = !socket.connecting;

      if (!reused) {
        socket.on("lookup", () => {
          dnsTime = Math.round((performance.now() - startTime) * 100) / 100;
        });

        socket.on("connect", () => {
          connectTime = Math.round((performance.now() - startTime) * 100) / 100;

          socketInfo = {
            remoteAddress: socket.remoteAddress ?? "",
            remotePort: socket.remotePort ?? 0,
            localPort: socket.localPort ?? 0,
            reused: false,
          };
        });

        socket.on("secureConnect", () => {
          gotSecureConnect = true;
          tlsTime = Math.round((performance.now() - startTime) * 100) / 100;
        });
      } else {
        gotSecureConnect = true;
        socketInfo = {
          remoteAddress: socket.remoteAddress ?? "",
          remotePort: socket.remotePort ?? 0,
          localPort: socket.localPort ?? 0,
          reused: true,
        };
      }
    });

    req.on("timeout", () => {
      req.destroy(Object.assign(new Error("Request timed out"), { code: "ETIMEDOUT" }));
    });

    req.on("error", (err: Error & { code?: string }) => {
      const totalTime = performance.now() - startTime;
      const classified = classifyNodeError(err, { gotResponse, gotSocket, gotSecureConnect });

      const result: ProbeResult = {
        id: randomUUID(),
        runtime: "https",
        timestamp: new Date().toISOString(),
        request: { url: DOPPLER_URL, timeout },
        success: false,
        error: classified,
        response: null,
        timing: {
          dns: dnsTime,
          connect: connectTime,
          tls: tlsTime,
          ttfb: 0,
          total: Math.round(totalTime * 100) / 100,
        },
        socket: socketInfo,
        cf: null,
        vercel,
      };

      agent.destroy();
      resolve(NextResponse.json(result));
    });

    req.end();
  });
}

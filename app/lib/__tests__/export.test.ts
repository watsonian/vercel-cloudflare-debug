import { describe, it, expect } from "vitest";
import { buildExportPayload, toCSV } from "../export";
import type { ProbeResult } from "../types";

const makeSuccess = (overrides?: Partial<ProbeResult>): ProbeResult => ({
  id: "test-1",
  runtime: "https",
  timestamp: "2026-08-17T10:00:00.000Z",
  request: { url: "https://api.doppler.com/v3/configs/config/secrets/download", timeout: 30000 },
  success: true,
  error: null,
  response: { status: 200, headers: { "cf-ray": "abc-IAD", "content-type": "application/json" } },
  timing: { dns: 5, connect: 10, tls: 15, ttfb: 50, total: 100 },
  socket: { remoteAddress: "1.2.3.4", remotePort: 443, localPort: 54321, reused: false },
  cf: { ray: "abc-IAD", colo: "IAD", mitigated: null },
  vercel: { region: "iad1", requestId: null, hostname: null, egressIp: null },
  ...overrides,
} as ProbeResult);

const makeFailure = (): ProbeResult => ({
  id: "test-2",
  runtime: "fetch",
  timestamp: "2026-08-17T10:00:01.000Z",
  request: { url: "https://api.doppler.com/v3/configs/config/secrets/download", timeout: 30000 },
  success: false,
  error: { code: "ECONNRESET", message: "socket hang up", phase: "connect" },
  response: null,
  timing: { dns: null, connect: null, tls: null, ttfb: 0, total: 50 },
  socket: null,
  cf: null,
  vercel: { region: "iad1", requestId: null, hostname: null, egressIp: null },
});

describe("buildExportPayload", () => {
  it("computes metadata from results", () => {
    const results = [makeSuccess(), makeFailure()];
    const payload = buildExportPayload(results);

    expect(payload.metadata.totalRequests).toBe(2);
    expect(payload.metadata.successCount).toBe(1);
    expect(payload.metadata.failureCount).toBe(1);
    expect(payload.metadata.runtimeBreakdown).toEqual({ https: 1, fetch: 1 });
    expect(payload.metadata.testDuration?.durationMs).toBe(1000);
    expect(payload.results).toEqual(results);
  });

  it("handles empty results", () => {
    const payload = buildExportPayload([]);
    expect(payload.metadata.totalRequests).toBe(0);
    expect(payload.metadata.testDuration).toBeNull();
  });
});

describe("toCSV", () => {
  it("produces header row and data rows", () => {
    const results = [makeSuccess(), makeFailure()];
    const csv = toCSV(results);
    const lines = csv.split("\n");

    expect(lines[0]).toMatch(/^# Doppler Probe Export/);

    const headerIdx = lines.findIndex((l) => !l.startsWith("#") && l.length > 0);
    const headers = lines[headerIdx].split(",");
    expect(headers).toContain("id");
    expect(headers).toContain("timing.ttfb");
    expect(headers).toContain("cf.ray");
    expect(headers).toContain("cf.colo");
    expect(headers).toContain("error.code");

    expect(lines.length).toBeGreaterThanOrEqual(headerIdx + 3);
  });
});

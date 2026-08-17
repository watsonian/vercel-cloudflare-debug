import type { ProbeResult, ExportMetadata, ExportPayload } from "./types";

export function buildExportPayload(results: ProbeResult[]): ExportPayload {
  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.length - successCount;
  const httpsCount = results.filter((r) => r.runtime === "https").length;

  let testDuration: ExportMetadata["testDuration"] = null;
  if (results.length > 0) {
    const timestamps = results.map((r) => new Date(r.timestamp).getTime());
    const first = Math.min(...timestamps);
    const last = Math.max(...timestamps);
    testDuration = {
      first: new Date(first).toISOString(),
      last: new Date(last).toISOString(),
      durationMs: last - first,
    };
  }

  return {
    metadata: {
      exportedAt: new Date().toISOString(),
      totalRequests: results.length,
      successCount,
      failureCount,
      runtimeBreakdown: {
        https: httpsCount,
        fetch: results.length - httpsCount,
      },
      testDuration,
    },
    results,
  };
}

const CSV_COLUMNS = [
  "id",
  "runtime",
  "timestamp",
  "success",
  "response.status",
  "error.code",
  "error.message",
  "error.phase",
  "timing.dns",
  "timing.connect",
  "timing.tls",
  "timing.ttfb",
  "timing.total",
  "socket.remoteAddress",
  "socket.remotePort",
  "socket.localPort",
  "socket.reused",
  "cf.ray",
  "cf.colo",
  "cf.mitigated",
  "vercel.region",
  "vercel.requestId",
  "vercel.hostname",
  "vercel.egressIp",
  "request.url",
  "request.timeout",
] as const;

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[part];
  }
  if (current == null) return "";
  const str = String(current);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCSV(results: ProbeResult[]): string {
  const payload = buildExportPayload(results);
  const meta = payload.metadata;

  const comments = [
    `# Doppler Probe Export`,
    `# Exported: ${meta.exportedAt}`,
    `# Total: ${meta.totalRequests} | Success: ${meta.successCount} | Failure: ${meta.failureCount}`,
    `# https: ${meta.runtimeBreakdown.https} | fetch: ${meta.runtimeBreakdown.fetch}`,
    meta.testDuration
      ? `# Duration: ${meta.testDuration.durationMs}ms (${meta.testDuration.first} to ${meta.testDuration.last})`
      : `# Duration: N/A`,
    "",
  ].join("\n");

  const header = CSV_COLUMNS.join(",");
  const rows = results.map((r) =>
    CSV_COLUMNS.map((col) => getNestedValue(r as unknown as Record<string, unknown>, col)).join(",")
  );

  return comments + header + "\n" + rows.join("\n") + "\n";
}

export function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportJSON(results: ProbeResult[]): void {
  const payload = buildExportPayload(results);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  downloadBlob(JSON.stringify(payload, null, 2), `doppler-probe-${timestamp}.json`, "application/json");
}

export function exportCSV(results: ProbeResult[]): void {
  const csv = toCSV(results);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  downloadBlob(csv, `doppler-probe-${timestamp}.csv`, "text/csv");
}

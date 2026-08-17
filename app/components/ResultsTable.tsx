"use client";

import { useState, useMemo, Fragment } from "react";
import type { ProbeResult } from "@/app/lib/types";

type SortField = "timestamp" | "runtime" | "success" | "response.status" | "timing.ttfb" | "timing.total" | "error.code";
type SortDir = "asc" | "desc";

function getValue(r: ProbeResult, field: SortField): string | number | boolean {
  switch (field) {
    case "timestamp": return r.timestamp;
    case "runtime": return r.runtime;
    case "success": return r.success;
    case "response.status": return r.response?.status ?? 0;
    case "timing.ttfb": return r.timing.ttfb;
    case "timing.total": return r.timing.total;
    case "error.code": return r.error?.code ?? "";
  }
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${month}/${day} ${hours}:${minutes}:${seconds}.${ms}`;
}

interface ResultsTableProps {
  results: ProbeResult[];
}

export default function ResultsTable({ results }: ResultsTableProps) {
  const [sortField, setSortField] = useState<SortField>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "success" | "failure">("all");

  const filtered = useMemo(() => {
    if (filter === "all") return results;
    return results.filter((r) => (filter === "success" ? r.success : !r.success));
  }, [results, filter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aVal = getValue(a, sortField);
      const bVal = getValue(b, sortField);
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return "";
    return sortDir === "asc" ? " \u25B2" : " \u25BC";
  };

  const columns: { label: string; field: SortField; tip: string }[] = [
    { label: "Timestamp", field: "timestamp", tip: "When the probe request was made" },
    { label: "Client", field: "runtime", tip: "HTTP client used: https = Node.js https module with socket diagnostics, fetch = standard fetch API (mirrors typical app code)" },
    { label: "Status", field: "success", tip: "Whether the request completed successfully" },
    { label: "HTTP", field: "response.status", tip: "HTTP status code from the Doppler API (via Cloudflare)" },
    { label: "Error", field: "error.code", tip: "Error code when the request failed (e.g., ECONNRESET, ETIMEDOUT)" },
    { label: "TTFB", field: "timing.ttfb", tip: "Time to first byte (ms) — time from request start to first response data" },
    { label: "Total", field: "timing.total", tip: "Total request duration (ms) — includes full response body transfer" },
  ];

  const staticColumns: { label: string; tip: string }[] = [
    { label: "Phase", tip: "Connection phase where the error occurred: dns, connect, tls, request, or response" },
    { label: "CF-Ray", tip: "Cloudflare Ray ID — unique identifier for this request at the CF edge" },
    { label: "Colo", tip: "Cloudflare data center (colo) that handled this request (e.g., IAD = Ashburn)" },
    { label: "CF-Mitigated", tip: "Cloudflare mitigation header — present when DDoS/WAF/rate-limiting mitigation was applied (e.g., challenge, managed)" },
    { label: "Region", tip: "Vercel serverless function region (e.g., iad1 = US East)" },
    { label: "Remote IP", tip: "IP address of the Cloudflare edge node that served this request" },
    { label: "Reused", tip: "Whether the TCP socket was reused from a previous request (Node runtime only)" },
  ];

  if (results.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        No results yet. Run a burst or start polling.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="flex gap-2 p-2 bg-gray-900 border-b border-gray-700">
        {(["all", "success", "failure"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2 py-0.5 text-xs rounded ${
              filter === f ? "bg-gray-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {f === "all" ? `All (${results.length})` : f === "success" ? `OK (${results.filter((r) => r.success).length})` : `Fail (${results.filter((r) => !r.success).length})`}
          </button>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-800 text-gray-400 sticky top-0">
          <tr>
            {columns.map((col) => (
              <th
                key={col.field}
                onClick={() => toggleSort(col.field)}
                title={col.tip}
                className="px-3 py-2 text-left cursor-pointer hover:text-white select-none whitespace-nowrap"
              >
                {col.label}{sortIcon(col.field)}
              </th>
            ))}
            {staticColumns.map((col) => (
              <th key={col.label} title={col.tip} className="px-3 py-2 text-left whitespace-nowrap">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <Fragment key={r.id}>
              <tr
                onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                className={`cursor-pointer border-b border-gray-800 hover:bg-gray-800/50 ${
                  !r.success ? "bg-red-950/30" : ""
                }`}
              >
                <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap">
                  {formatTimestamp(r.timestamp)}
                </td>
                <td className="px-3 py-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                    r.runtime === "https" ? "bg-green-900 text-green-300" : "bg-purple-900 text-purple-300"
                  }`}>
                    {r.runtime}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  {r.success ? (
                    <span className="text-green-400">OK</span>
                  ) : (
                    <span className="text-red-400">FAIL</span>
                  )}
                </td>
                <td className="px-3 py-1.5 font-mono">{r.response?.status ?? "-"}</td>
                <td className="px-3 py-1.5 font-mono text-red-300">{r.error?.code ?? "-"}</td>
                <td className="px-3 py-1.5 font-mono">{r.timing.ttfb.toFixed(1)}</td>
                <td className="px-3 py-1.5 font-mono">{r.timing.total.toFixed(1)}</td>
                <td className="px-3 py-1.5 text-xs">{r.error?.phase ?? "-"}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{r.cf?.ray ?? "-"}</td>
                <td className="px-3 py-1.5">{r.cf?.colo ?? "-"}</td>
                <td className={`px-3 py-1.5 text-xs font-mono ${r.cf?.mitigated ? "text-yellow-300 font-bold" : ""}`}>
                  {r.cf?.mitigated ?? "-"}
                </td>
                <td className="px-3 py-1.5 text-xs">{r.vercel?.region ?? "-"}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{r.socket?.remoteAddress ?? "-"}</td>
                <td className="px-3 py-1.5">{r.socket?.reused != null ? (r.socket.reused ? "Y" : "N") : "-"}</td>
              </tr>
              {expandedId === r.id && (
                <tr className="bg-gray-900/80">
                  <td colSpan={14} className="px-6 py-3">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <h4 className="font-medium text-gray-300 mb-1">Timing (ms)</h4>
                        <pre className="text-gray-400">
{`DNS:     ${r.timing.dns?.toFixed(2) ?? "N/A"}
Connect: ${r.timing.connect?.toFixed(2) ?? "N/A"}
TLS:     ${r.timing.tls?.toFixed(2) ?? "N/A"}
TTFB:    ${r.timing.ttfb.toFixed(2)}
Total:   ${r.timing.total.toFixed(2)}`}
                        </pre>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-300 mb-1">Socket</h4>
                        {r.socket ? (
                          <pre className="text-gray-400">
{`Remote: ${r.socket.remoteAddress}:${r.socket.remotePort}
Local:  :${r.socket.localPort}
Reused: ${r.socket.reused}`}
                          </pre>
                        ) : (
                          <span className="text-gray-500">N/A (Edge runtime)</span>
                        )}
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-300 mb-1">Vercel Host</h4>
                        <pre className="text-gray-400">
{`Region:    ${r.vercel?.region ?? "N/A"}
Req ID:    ${r.vercel?.requestId ?? "N/A"}
Hostname:  ${r.vercel?.hostname ?? "N/A"}
Egress IP: ${r.vercel?.egressIp ?? "N/A"}`}
                        </pre>
                      </div>
                      {r.error && (
                        <div>
                          <h4 className="font-medium text-gray-300 mb-1">Error</h4>
                          <pre className="text-red-400">{`${r.error.code}: ${r.error.message}\nPhase: ${r.error.phase}`}</pre>
                        </div>
                      )}
                      {r.response && (
                        <div className="col-span-2">
                          <h4 className="font-medium text-gray-300 mb-1">Response Headers</h4>
                          <pre className="text-gray-400 max-h-40 overflow-auto">
                            {Object.entries(r.response.headers)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join("\n")}
                          </pre>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

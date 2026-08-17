"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import type { ProbeResult } from "@/app/lib/types";

interface DashboardProps {
  results: ProbeResult[];
}

interface RollupEntry {
  value: string;
  count: number;
  pct: string;
}

function computeRollup(values: string[]): RollupEntry[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const total = values.length;
  return Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      count,
      pct: ((count / total) * 100).toFixed(1),
    }))
    .sort((a, b) => b.count - a.count);
}

function computeStreaks(results: ProbeResult[]) {
  if (results.length === 0) return { current: 0, longest: 0, lastRecovery: null as string | null };

  const sorted = [...results].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  let longest = 0;
  let lastRecovery: string | null = null;
  let streak = 0;

  for (const r of sorted) {
    if (!r.success) {
      streak++;
      longest = Math.max(longest, streak);
    } else {
      if (streak > 0) {
        lastRecovery = r.timestamp;
      }
      streak = 0;
    }
  }
  const current = streak;
  longest = Math.max(longest, current);

  return { current, longest, lastRecovery };
}

function RollupCard({ title, entries }: { title: string; entries: RollupEntry[] }) {
  return (
    <div className="bg-gray-800 rounded p-3">
      <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-2">{title}</h3>
      <div className="space-y-1 text-sm max-h-24 overflow-auto">
        {entries.map(({ value, count, pct }) => (
          <div key={value} className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-gray-300 font-mono truncate">{value}</span>
                <span className="text-gray-400 ml-2 shrink-0">{count} ({pct}%)</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1">
                <div
                  className="bg-blue-500 h-1 rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard({ results }: DashboardProps) {
  const errorRateData = useMemo(() => {
    if (results.length === 0) return [];
    const sorted = [...results].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const bucketMs = 10_000;
    const buckets = new Map<number, { https: { total: number; fail: number }; fetch: { total: number; fail: number } }>();

    for (const r of sorted) {
      const t = Math.floor(new Date(r.timestamp).getTime() / bucketMs) * bucketMs;
      if (!buckets.has(t)) {
        buckets.set(t, { https: { total: 0, fail: 0 }, fetch: { total: 0, fail: 0 } });
      }
      const b = buckets.get(t)!;
      const rt = r.runtime;
      b[rt].total++;
      if (!r.success) b[rt].fail++;
    }

    return Array.from(buckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([t, b]) => ({
        time: new Date(t).toLocaleTimeString("en-US", { hour12: false }),
        httpsErrorRate: b.https.total > 0 ? Math.round((b.https.fail / b.https.total) * 100) : null,
        fetchErrorRate: b.fetch.total > 0 ? Math.round((b.fetch.fail / b.fetch.total) * 100) : null,
      }));
  }, [results]);

  const errorBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of results) {
      if (!r.success && r.error) {
        counts.set(r.error.code, (counts.get(r.error.code) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);
  }, [results]);

  const ttfbDistribution = useMemo(() => {
    const successes = results.filter((r) => r.success);
    if (successes.length === 0) return [];
    const values = successes.map((r) => r.timing.ttfb);
    const max = Math.max(...values);
    const bucketSize = Math.max(10, Math.ceil(max / 15 / 10) * 10);
    const buckets = new Map<number, { https: number; fetch: number }>();
    for (const r of successes) {
      const bucket = Math.floor(r.timing.ttfb / bucketSize) * bucketSize;
      if (!buckets.has(bucket)) buckets.set(bucket, { https: 0, fetch: 0 });
      buckets.get(bucket)![r.runtime]++;
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([ms, counts]) => ({ range: `${ms}`, https: counts.https, fetch: counts.fetch }));
  }, [results]);

  // Rollup data
  const coloRollup = useMemo(() =>
    computeRollup(results.map((r) => r.cf?.colo ?? "unknown")),
  [results]);

  const remoteIpRollup = useMemo(() =>
    computeRollup(results.map((r) => r.socket?.remoteAddress ?? "N/A")),
  [results]);

  const runtimeRollup = useMemo(() =>
    computeRollup(results.map((r) => r.runtime)),
  [results]);

  const statusRollup = useMemo(() =>
    computeRollup(results.map((r) => r.success ? `${r.response?.status ?? "OK"}` : `FAIL:${r.error?.code ?? "?"}`)),
  [results]);

  const regionRollup = useMemo(() =>
    computeRollup(results.map((r) => r.vercel?.region ?? "unknown")),
  [results]);

  const hostnameRollup = useMemo(() =>
    computeRollup(results.map((r) => r.vercel?.hostname ?? "unknown")),
  [results]);

  const egressIpRollup = useMemo(() => {
    const withEgress = results.filter((r) => r.vercel?.egressIp);
    if (withEgress.length === 0) return [];
    return computeRollup(withEgress.map((r) => r.vercel!.egressIp!));
  }, [results]);

  const mitigatedCount = useMemo(() =>
    results.filter((r) => r.cf?.mitigated).length,
  [results]);

  // Error-only rollups
  const errors = useMemo(() => results.filter((r) => !r.success), [results]);

  const errorColoRollup = useMemo(() =>
    computeRollup(errors.map((r) => r.cf?.colo ?? "unknown")),
  [errors]);

  const errorIpRollup = useMemo(() =>
    computeRollup(errors.map((r) => r.socket?.remoteAddress ?? "N/A")),
  [errors]);

  const errorClientRollup = useMemo(() =>
    computeRollup(errors.map((r) => r.runtime)),
  [errors]);

  const streaks = useMemo(() => computeStreaks(results), [results]);

  if (results.length === 0) return null;

  const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899"];

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.length - successCount;

  return (
    <div className="bg-gray-900 border-t border-gray-700 p-4 space-y-4">
      {/* Row 1: Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-gray-800 rounded p-3">
          <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-2">Summary</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Total:</span>
              <span className="text-white">{results.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Success:</span>
              <span className="text-green-400">{successCount} ({((successCount / results.length) * 100).toFixed(1)}%)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Failure:</span>
              <span className="text-red-400">{failureCount} ({((failureCount / results.length) * 100).toFixed(1)}%)</span>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded p-3">
          <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-2">Failure Streaks</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Current:</span>
              <span className={streaks.current > 0 ? "text-red-400 font-bold" : "text-green-400"}>
                {streaks.current}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Longest:</span>
              <span className="text-white">{streaks.longest}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Recovery:</span>
              <span className="text-white text-xs">
                {streaks.lastRecovery
                  ? new Date(streaks.lastRecovery).toLocaleTimeString("en-US", { hour12: false })
                  : "N/A"}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded p-3">
          <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-2">Avg Timing (success)</h3>
          {(() => {
            const successes = results.filter((r) => r.success);
            if (successes.length === 0) return <span className="text-gray-500 text-sm">No data</span>;
            const avgTtfb = successes.reduce((a, r) => a + r.timing.ttfb, 0) / successes.length;
            const avgTotal = successes.reduce((a, r) => a + r.timing.total, 0) / successes.length;
            const p95 = [...successes].sort((a, b) => a.timing.ttfb - b.timing.ttfb)[Math.floor(successes.length * 0.95)]?.timing.ttfb ?? 0;
            return (
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">TTFB avg:</span>
                  <span className="text-white font-mono">{avgTtfb.toFixed(0)}ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">TTFB p95:</span>
                  <span className="text-white font-mono">{p95.toFixed(0)}ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total avg:</span>
                  <span className="text-white font-mono">{avgTotal.toFixed(0)}ms</span>
                </div>
              </div>
            );
          })()}
        </div>

        <RollupCard title="CF Colo" entries={coloRollup} />
        <RollupCard title="Remote IP" entries={remoteIpRollup} />
        <RollupCard title="Vercel Region" entries={regionRollup} />
      </div>

      {/* Row 2: Status + host fingerprint */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <RollupCard title="Response Status" entries={statusRollup} />
        <RollupCard title="Container Host" entries={hostnameRollup} />
        {egressIpRollup.length > 0 && (
          <RollupCard title="Egress IP" entries={egressIpRollup} />
        )}
        {mitigatedCount > 0 && (
          <div className="bg-yellow-900/50 border border-yellow-600 rounded p-3 col-span-2 md:col-span-1">
            <h3 className="text-xs text-yellow-400 uppercase tracking-wide mb-2">CF-Mitigated</h3>
            <div className="text-sm">
              <span className="text-yellow-300 font-bold text-lg">{mitigatedCount}</span>
              <span className="text-yellow-400 ml-1 text-xs">
                ({((mitigatedCount / results.length) * 100).toFixed(1)}%) requests had cf-mitigated header
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Row 3: Error rollups (only when errors exist) */}
      {errors.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <RollupCard title={`Errors by Colo (${errors.length})`} entries={errorColoRollup} />
          <RollupCard title={`Errors by Remote IP (${errors.length})`} entries={errorIpRollup} />
          <RollupCard title={`Errors by Client (${errors.length})`} entries={errorClientRollup} />
        </div>
      )}

      {/* Row 3: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded p-3">
          <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-2">TTFB Distribution (ms)</h3>
          {ttfbDistribution.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-gray-500 text-sm">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={ttfbDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="range" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "4px" }}
                  labelStyle={{ color: "#9ca3af" }}
                  labelFormatter={(label, payload) => {
                    const total = payload?.reduce((sum, p) => sum + ((p.value as number) ?? 0), 0) ?? 0;
                    return `${total} requests (${label}ms)`;
                  }}
                />
                <Bar dataKey="https" stackId="a" fill="#22c55e" name="https" />
                <Bar dataKey="fetch" stackId="a" fill="#8b5cf6" name="fetch" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-gray-800 rounded p-3">
          <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-2">Error Rate Over Time (%)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={errorRateData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="time" tick={{ fill: "#9ca3af", fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fill: "#9ca3af", fontSize: 10 }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "4px" }}
                labelStyle={{ color: "#9ca3af" }}
              />
              <Line type="monotone" dataKey="httpsErrorRate" stroke="#22c55e" name="https" dot={false} connectNulls />
              <Line type="monotone" dataKey="fetchErrorRate" stroke="#8b5cf6" name="fetch" dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-gray-800 rounded p-3">
          <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-2">Error Types</h3>
          {errorBreakdown.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-gray-500 text-sm">No errors</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={errorBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="code" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "4px" }}
                  labelStyle={{ color: "#9ca3af" }}
                />
                <Bar dataKey="count" name="Count">
                  {errorBreakdown.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Controls, { type ControlState } from "@/app/components/Controls";
import ResultsTable from "@/app/components/ResultsTable";
import Dashboard from "@/app/components/Dashboard";
import { runBurst, startPolling, loadPersistedResults, persistResults, clearPersistedResults } from "@/app/lib/probe";
import { exportJSON, exportCSV } from "@/app/lib/export";
import type { ProbeResult } from "@/app/lib/types";

export default function Home() {
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [isBursting, setIsBursting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [persist, setPersist] = useState(false);
  const stopPollingRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const stored = loadPersistedResults();
    if (stored.length > 0) {
      setResults(stored);
      setPersist(true);
    }
  }, []);

  useEffect(() => {
    if (persist && results.length > 0) {
      persistResults(results);
    }
  }, [persist, results]);

  const addResult = useCallback((result: ProbeResult) => {
    setResults((prev) => [...prev, result]);
  }, []);

  const handleRunBurst = useCallback(
    async (state: ControlState) => {
      setIsBursting(true);
      try {
        await runBurst(
          state.runtimes,
          state.burstCount,
          state.burstConcurrency,
          { timeout: state.timeout, keepalive: state.keepalive, egressIp: state.egressIp },
          addResult
        );
      } finally {
        setIsBursting(false);
      }
    },
    [addResult]
  );

  const handleStartPolling = useCallback(
    (state: ControlState) => {
      const stop = startPolling(
        state.runtimes,
        state.pollingInterval * 1000,
        { timeout: state.timeout, keepalive: state.keepalive, egressIp: state.egressIp },
        addResult
      );
      stopPollingRef.current = stop;
      setIsPolling(true);
    },
    [addResult]
  );

  const handleStopPolling = useCallback(() => {
    stopPollingRef.current?.();
    stopPollingRef.current = null;
    setIsPolling(false);
  }, []);

  const handleClear = useCallback(() => {
    setResults([]);
    clearPersistedResults();
  }, []);

  const handlePersistChange = useCallback(
    (enabled: boolean) => {
      setPersist(enabled);
      if (!enabled) {
        clearPersistedResults();
      } else if (results.length > 0) {
        persistResults(results);
      }
    },
    [results]
  );

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white">
      <header className="bg-gray-900 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Doppler API Probe</h1>
          <p className="text-xs text-gray-400">Vercel &rarr; Cloudflare &rarr; Doppler diagnostic tool</p>
        </div>
        <button
          onClick={async () => {
            await fetch("/api/auth", { method: "DELETE" });
            window.location.href = "/login";
          }}
          className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
        >
          Logout
        </button>
      </header>

      <Controls
        onRunBurst={handleRunBurst}
        onStartPolling={handleStartPolling}
        onStopPolling={handleStopPolling}
        onClear={handleClear}
        onExportJSON={() => exportJSON(results)}
        onExportCSV={() => exportCSV(results)}
        isPolling={isPolling}
        isBursting={isBursting}
        resultCount={results.length}
        persist={persist}
        onPersistChange={handlePersistChange}
      />

      <ResultsTable results={results} />

      <Dashboard results={results} />
    </div>
  );
}

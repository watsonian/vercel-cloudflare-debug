"use client";

import { useState } from "react";

export interface ControlState {
  burstCount: number;
  burstConcurrency: number;
  pollingInterval: number;
  runtimes: ("https" | "fetch")[];
  timeout: number;
  keepalive: boolean;
  egressIp: boolean;
  persist: boolean;
}

interface ControlsProps {
  onRunBurst: (state: ControlState) => void;
  onStartPolling: (state: ControlState) => void;
  onStopPolling: () => void;
  onClear: () => void;
  onExportJSON: () => void;
  onExportCSV: () => void;
  isPolling: boolean;
  isBursting: boolean;
  resultCount: number;
  persist: boolean;
  onPersistChange: (persist: boolean) => void;
}

export default function Controls({
  onRunBurst,
  onStartPolling,
  onStopPolling,
  onClear,
  onExportJSON,
  onExportCSV,
  isPolling,
  isBursting,
  resultCount,
  persist,
  onPersistChange,
}: ControlsProps) {
  const [burstCount, setBurstCount] = useState(10);
  const [burstConcurrency, setBurstConcurrency] = useState(5);
  const [pollingInterval, setPollingInterval] = useState(10);
  const [runtimeHttps, setRuntimeHttps] = useState(true);
  const [runtimeFetch, setRuntimeFetch] = useState(true);
  const [timeout, setTimeout_] = useState(30000);
  const [keepalive, setKeepalive] = useState(true);
  const [egressIp, setEgressIp] = useState(false);

  const runtimes: ("https" | "fetch")[] = [
    ...(runtimeHttps ? (["https"] as const) : []),
    ...(runtimeFetch ? (["fetch"] as const) : []),
  ];

  const state: ControlState = {
    burstCount: Math.min(burstCount, 50),
    burstConcurrency: Math.min(burstConcurrency, 10),
    pollingInterval: Math.max(pollingInterval, 5),
    runtimes,
    timeout,
    keepalive,
    egressIp,
    persist,
  };

  const showWarning = burstConcurrency > 5 || burstCount > 20;
  const noRuntime = runtimes.length === 0;

  return (
    <div className="bg-gray-900 border-b border-gray-700 px-4 py-3 space-y-3">
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {/* Burst Mode */}
        <fieldset>
          <legend className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1.5">Burst Mode</legend>
          <div className="flex gap-2 items-center h-8">
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-500">Count</label>
              <input
                type="number"
                min={1}
                max={50}
                value={burstCount}
                onChange={(e) => setBurstCount(Number(e.target.value))}
                className="w-16 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white"
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-500">Conc</label>
              <input
                type="number"
                min={1}
                max={10}
                value={burstConcurrency}
                onChange={(e) => setBurstConcurrency(Number(e.target.value))}
                className="w-14 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white"
              />
            </div>
            <button
              onClick={() => onRunBurst(state)}
              disabled={isBursting || noRuntime}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded font-medium"
            >
              {isBursting ? "Running..." : "Run"}
            </button>
          </div>
        </fieldset>

        {/* Polling Mode */}
        <fieldset>
          <legend className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1.5">Polling Mode</legend>
          <div className="flex gap-2 items-center h-8">
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-500">Interval (s)</label>
              <input
                type="number"
                min={5}
                max={300}
                value={pollingInterval}
                onChange={(e) => setPollingInterval(Number(e.target.value))}
                className="w-16 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white"
              />
            </div>
            <button
              onClick={() => (isPolling ? onStopPolling() : onStartPolling(state))}
              disabled={noRuntime && !isPolling}
              className={`px-3 py-1 text-white text-sm rounded font-medium ${
                isPolling
                  ? "bg-red-600 hover:bg-red-500"
                  : "bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
              }`}
            >
              {isPolling ? "Stop" : "Start"}
            </button>
          </div>
        </fieldset>

        {/* Config */}
        <fieldset>
          <legend className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1.5">Config</legend>
          <div className="flex gap-3 items-center h-8">
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-500">Timeout</label>
              <input
                type="number"
                min={1000}
                max={60000}
                step={1000}
                value={timeout}
                onChange={(e) => setTimeout_(Number(e.target.value))}
                className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white"
              />
            </div>
            <label className={`flex items-center gap-1.5 text-sm ${runtimeHttps ? "text-gray-300" : "text-gray-600"}`}>
              <input
                type="checkbox"
                checked={keepalive}
                onChange={(e) => setKeepalive(e.target.checked)}
                disabled={!runtimeHttps}
                className="rounded"
              />
              Keepalive
            </label>
            <label className="flex items-center gap-1.5 text-sm text-gray-300" title="Fetch the function's egress IP via checkip.amazonaws.com (adds ~50ms per probe)">
              <input
                type="checkbox"
                checked={egressIp}
                onChange={(e) => setEgressIp(e.target.checked)}
                className="rounded"
              />
              Egress IP
            </label>
          </div>
        </fieldset>

        {/* Client */}
        <fieldset>
          <legend className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1.5">Client</legend>
          <div className="flex gap-3 items-center h-8">
            <label className="flex items-center gap-1.5 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={runtimeHttps}
                onChange={(e) => setRuntimeHttps(e.target.checked)}
              />
              https
            </label>
            <label className="flex items-center gap-1.5 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={runtimeFetch}
                onChange={(e) => setRuntimeFetch(e.target.checked)}
              />
              fetch
            </label>
          </div>
        </fieldset>

        {/* Data */}
        <fieldset>
          <legend className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1.5">
            Data ({resultCount})
          </legend>
          <div className="flex gap-2 items-center h-8">
            <label className="flex items-center gap-1.5 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={persist}
                onChange={(e) => onPersistChange(e.target.checked)}
              />
              Persist
            </label>
            <button
              onClick={onClear}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded"
            >
              Clear
            </button>
            <button
              onClick={onExportJSON}
              disabled={resultCount === 0}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white text-sm rounded"
            >
              JSON
            </button>
            <button
              onClick={onExportCSV}
              disabled={resultCount === 0}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white text-sm rounded"
            >
              CSV
            </button>
          </div>
        </fieldset>
      </div>

      {showWarning && (
        <p className="text-xs text-yellow-400">
          High request volume may trigger rate limiting or DDoS mitigation, which could affect results.
        </p>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

// Live queue wallboard. Polls /api/queues/live (the QueueStatus rows the ARI daemon writes) every
// ~3s and renders per-queue tiles. No live-push infra exists (the daemon + Next are separate
// processes), so polling mirrors the SystemStatus/health read pattern; sub-second SSE via Postgres
// LISTEN/NOTIFY is a documented future upgrade.

type Row = {
  id: string;
  number: string;
  name: string;
  waiting: number;
  longestWaitSec: number;
  agentsAvailable: number;
  agentsOnCall: number;
  agentsPaused: number;
  answeredToday: number;
  abandonedToday: number;
  avgWaitSec: number;
  updatedAt: string | null;
};

function mmss(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function Wallboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/queues/live", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as { queues: Row[] };
        if (alive) {
          setRows(j.queues ?? []);
          setErr(null);
          setLoaded(true);
        }
      } catch (e) {
        if (alive) setErr((e as Error).message);
      }
    };
    load();
    const t = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (err) return <p className="error text-sm">Wallboard feed error: {err}</p>;
  if (!loaded) return <p className="muted text-sm">Loading…</p>;
  if (rows.length === 0) return <p className="muted text-sm">No queues yet.</p>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {rows.map((q) => {
        const busyWait = q.waiting > 0;
        return (
          <div key={q.id} className="card">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-medium">{q.name}</h2>
              <span className="font-mono muted text-sm">{q.number}</span>
            </div>

            <div className="flex items-end gap-6 mb-4">
              <div>
                <div className={`text-4xl font-semibold ${busyWait ? "text-amber-500" : ""}`}>{q.waiting}</div>
                <div className="muted text-xs">waiting</div>
              </div>
              <div>
                <div className="text-2xl font-medium">{mmss(q.longestWaitSec)}</div>
                <div className="muted text-xs">longest wait</div>
              </div>
            </div>

            <div className="flex gap-2 mb-4 text-sm">
              <span className="badge badge-online">{q.agentsAvailable} avail</span>
              <span className="badge badge-warn">{q.agentsOnCall} on call</span>
              <span className="badge badge-offline">{q.agentsPaused} paused</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-lg font-medium">{q.answeredToday}</div>
                <div className="muted text-xs">answered</div>
              </div>
              <div>
                <div className="text-lg font-medium">{q.abandonedToday}</div>
                <div className="muted text-xs">abandoned</div>
              </div>
              <div>
                <div className="text-lg font-medium">{mmss(q.avgWaitSec)}</div>
                <div className="muted text-xs">avg wait</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

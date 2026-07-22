"use client";

import { useState } from "react";
import { rebootDevice, rebootAll } from "./reboot";

// Client controls that invoke the reboot/force-provision server actions and surface the AMI
// result inline. `resync` = re-read config (no reboot); `reboot` = reboot the phone. Importing
// the "use server" reboot.ts yields action proxies — the AMI/node:net code never reaches the client.
type Mode = "resync" | "reboot";

export function DeviceControls({ deviceId }: { deviceId: string }) {
  const [busy, setBusy] = useState<Mode | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(mode: Mode) {
    setBusy(mode);
    setMsg(null);
    try {
      const r = await rebootDevice(deviceId, mode);
      setMsg({ ok: r.ok, text: r.message });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message ?? "Failed" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        className="btn-ghost"
        disabled={busy !== null}
        onClick={() => run("resync")}
        title="Send check-sync so the phone re-pulls its config now (no reboot)"
      >
        {busy === "resync" ? "…" : "Force provision"}
      </button>
      <button
        className="btn-ghost"
        disabled={busy !== null}
        onClick={() => run("reboot")}
        title="Reboot the phone (it re-provisions on boot)"
      >
        {busy === "reboot" ? "…" : "Reboot"}
      </button>
      {msg && <span className={`text-xs ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</span>}
    </span>
  );
}

export function RebootAll() {
  const [busy, setBusy] = useState<Mode | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(mode: Mode) {
    if (!confirm(`${mode === "reboot" ? "Reboot" : "Re-provision"} ALL enabled phones?`)) return;
    setBusy(mode);
    setMsg(null);
    try {
      const r = await rebootAll(mode);
      setMsg(r.message);
    } catch (e) {
      setMsg((e as Error).message ?? "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn-ghost" disabled={busy !== null} onClick={() => run("resync")}>
        {busy === "resync" ? "…" : "Force provision all"}
      </button>
      <button className="btn-ghost" disabled={busy !== null} onClick={() => run("reboot")}>
        {busy === "reboot" ? "…" : "Reboot all"}
      </button>
      {msg && <span className="muted text-xs">{msg}</span>}
    </div>
  );
}

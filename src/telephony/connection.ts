// ARI connection lifecycle. The daemon connects to Asterisk's ARI events WebSocket for our
// Stasis app and streams JSON events into the dispatcher. Exponential-backoff reconnect; on
// (re)connect it re-adopts in-flight channels so a daemon restart doesn't strand live calls.
//
// NOTE: this uses the standard inbound events WS (our app connects to Asterisk). Asterisk 22's
// ARI *outbound* WebSockets (Asterisk dials out to us) are a drop-in hardening upgrade for
// prod — swap the transport here; the dispatcher/routing stay identical. See BUILD-PLAN.md.
import WebSocket from "ws";
import { ARI_HTTP_URL, ARI_USER, ARI_PASSWORD, ARI_APP } from "@/lib/env";
import { dispatch } from "./dispatcher";
import { recoverState } from "./stateRecovery";
import { setStatus } from "./status";

function wsUrl(): string {
  const base = ARI_HTTP_URL.replace(/^http/i, "ws");
  const key = encodeURIComponent(`${ARI_USER}:${ARI_PASSWORD}`);
  return `${base}/ari/events?app=${encodeURIComponent(ARI_APP)}&api_key=${key}&subscribeAll=true`;
}

export function startAriConnection(): () => void {
  let ws: WebSocket | null = null;
  let backoff = 1000;
  let stopped = false;

  const connect = () => {
    if (stopped) return;
    ws = new WebSocket(wsUrl());

    ws.on("open", async () => {
      backoff = 1000;
      console.log("[ari] connected to Asterisk events");
      await setStatus({ ariConnected: true, asteriskReachable: true, lastReconnectAt: new Date() });
      await recoverState().catch((e) => console.error("[ari] state recovery error:", e));
    });

    ws.on("message", (data: WebSocket.RawData) => {
      let ev: unknown;
      try {
        ev = JSON.parse(data.toString());
      } catch {
        return;
      }
      void dispatch(ev as Parameters<typeof dispatch>[0]);
    });

    ws.on("close", () => {
      void setStatus({ ariConnected: false });
      if (!stopped) scheduleReconnect();
    });

    ws.on("error", (e: Error) => {
      console.error("[ari] ws error:", e.message);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    });
  };

  const scheduleReconnect = () => {
    const delay = backoff;
    backoff = Math.min(backoff * 2, 15000);
    console.log(`[ari] reconnecting in ${delay}ms`);
    setTimeout(connect, delay);
  };

  connect();
  return () => {
    stopped = true;
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
  };
}

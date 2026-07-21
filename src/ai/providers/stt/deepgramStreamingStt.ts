// Real streaming STT via Deepgram's live WebSocket API. Opt-in: REALTIME_STT_PROVIDER=deepgram
// + DEEPGRAM_API_KEY. We feed raw linear16 @ 16 kHz and drive turn boundaries from our own VAD
// (finalizeUtterance → Deepgram "Finalize"), so the agent's endpointing stays authoritative.
// Worker-safe. Never imported unless a key is set (resolve.ts gates it).
import WebSocket from "ws";
import type { SttStreamCallbacks, SttStreamHandle, StreamingSttProvider } from "./streamingSttProvider";
import { deepgramKey } from "@/lib/env";

const DG_URL =
  "wss://api.deepgram.com/v1/listen?" +
  new URLSearchParams({
    encoding: "linear16",
    sample_rate: "16000",
    channels: "1",
    model: "nova-2",
    interim_results: "true",
    punctuate: "true",
    smart_format: "true",
    // Our VAD handles endpointing; keep Deepgram's short so Finalize returns promptly.
    endpointing: "300",
  }).toString();

export const deepgramStreamingSttProvider: StreamingSttProvider = {
  name: "deepgram",
  openStream(cb: SttStreamCallbacks): SttStreamHandle {
    const key = deepgramKey();
    if (!key) throw new Error("DEEPGRAM_API_KEY not set");

    const ws = new WebSocket(DG_URL, { headers: { Authorization: `Token ${key}` } });
    const backlog: Buffer[] = [];
    let open = false;
    let closed = false;
    let pendingFinalize = false;
    let utterance = ""; // accumulated is_final pieces for the current turn
    // Deepgram closes an idle socket; a light keepalive keeps it warm between turns.
    let keepAlive: ReturnType<typeof setInterval> | null = null;

    ws.on("open", () => {
      open = true;
      for (const f of backlog) ws.send(f);
      backlog.length = 0;
      keepAlive = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "KeepAlive" }));
      }, 8000);
    });

    ws.on("message", (data: WebSocket.RawData) => {
      let msg: {
        type?: string;
        is_final?: boolean;
        speech_final?: boolean;
        channel?: { alternatives?: { transcript?: string }[] };
      };
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.type !== "Results") return;
      const text = msg.channel?.alternatives?.[0]?.transcript ?? "";
      if (!msg.is_final) {
        if (text && cb.onPartial) cb.onPartial(text);
        return;
      }
      if (text) utterance = utterance ? `${utterance} ${text}` : text;
      if (msg.speech_final || pendingFinalize) {
        const out = utterance.trim();
        utterance = "";
        pendingFinalize = false;
        if (out) cb.onFinal(out);
      }
    });

    ws.on("error", (e: Error) => cb.onError?.(e));
    ws.on("close", () => {
      if (keepAlive) clearInterval(keepAlive);
    });

    return {
      pushPcm(frame: Buffer) {
        if (closed) return;
        if (open && ws.readyState === WebSocket.OPEN) ws.send(frame);
        else backlog.push(frame);
      },
      finalizeUtterance() {
        if (closed) return;
        pendingFinalize = true;
        if (open && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "Finalize" }));
      },
      close() {
        if (closed) return;
        closed = true;
        if (keepAlive) clearInterval(keepAlive);
        try {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "CloseStream" }));
          ws.close();
        } catch {
          /* ignore */
        }
      },
    };
  },
};

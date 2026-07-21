// Deterministic offline streaming STT. It ignores audio content (can't really transcribe) and
// instead emits a scripted caller utterance each time the orchestrator finalizes a turn — a
// small conversation that exercises every brain branch (answer → transfer → message → end) so
// the whole pipeline is demoable end-to-end for $0. Deterministic (counter-based, no randomness)
// so the offline tests are stable. Worker-safe.
import type { SttStreamCallbacks, SttStreamHandle, StreamingSttProvider } from "./streamingSttProvider";

// One line per caller turn; clamps to the last line if the call runs long.
export const MOCK_SCRIPT = [
  "what are your hours",
  "do you handle plumbing",
  "can I speak to a person",
  "actually just take a message",
  "no thanks, goodbye",
];

export const mockStreamingSttProvider: StreamingSttProvider = {
  name: "mock",
  openStream(cb: SttStreamCallbacks): SttStreamHandle {
    let turn = 0;
    let fed = 0; // frames pushed this utterance (so a no-audio finalize emits nothing)
    let closed = false;
    return {
      pushPcm() {
        if (!closed) fed++;
      },
      finalizeUtterance() {
        if (closed) return;
        if (fed === 0) return; // no speech captured → no transcript (drives NOINPUT handling)
        fed = 0;
        const text = MOCK_SCRIPT[Math.min(turn, MOCK_SCRIPT.length - 1)];
        turn++;
        // async so it behaves like a network round-trip (orchestrator awaits via callback)
        queueMicrotask(() => {
          if (!closed) cb.onFinal(text);
        });
      },
      close() {
        closed = true;
      },
    };
  },
};

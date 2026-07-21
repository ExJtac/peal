// Streaming speech-to-text seam for the real-time voice agent. Distinct from the batch
// `SttProvider` (which transcribes a finished recording for post-call summaries): here the
// orchestrator pushes live 20 ms slin16 frames while the caller talks and gets an `onFinal`
// transcript when the utterance ends. Mock-default (free/offline). Worker-safe.

export interface SttStreamCallbacks {
  /** Interim hypothesis (optional; real engines emit these, the mock does not). */
  onPartial?(text: string): void;
  /** The finalized transcript for one caller utterance. */
  onFinal(text: string): void;
  onError?(err: Error): void;
}

export interface SttStreamHandle {
  /** Feed one 640-byte slin16 frame (16 kHz mono, little-endian). */
  pushPcm(frame: Buffer): void;
  /** The local VAD says the caller stopped — force the engine to emit a final now. */
  finalizeUtterance(): void;
  /** Tear the stream down (closes the socket / stops billing). Idempotent. */
  close(): void;
}

export interface StreamingSttProvider {
  name: string;
  openStream(cb: SttStreamCallbacks): SttStreamHandle;
}

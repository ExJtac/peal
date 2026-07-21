// Voice-activity detection + endpointing over 20 ms slin16 frames.
//
// Two jobs, one detector:
//  1. Turn-taking — decide when the caller STARTED talking and when their utterance ENDED
//     (a run of trailing silence = endpointing). Drives the mock STT and the "your turn" gate.
//  2. Barge-in — the same start signal, run on inbound audio WHILE the AI is speaking, tells the
//     orchestrator to stop TTS injection immediately.
//
// Energy-based (RMS), debounced on both edges so single-frame blips don't flip state. This is
// deliberately simple + deterministic (unit-testable, no network) — real STT engines do their
// own endpointing, but local VAD is what makes barge-in instant. Worker-safe.
import { frameEnergy, FRAME_MS } from "./rtp";

export interface VadConfig {
  /** RMS energy (0..1) above which a frame counts as speech. Telephony speech ≈ 0.02–0.2. */
  energyThreshold: number;
  /** Consecutive speech needed to declare start (debounce against clicks/blips). */
  speechStartMs: number;
  /** Trailing silence that ends an utterance (endpointing). From AiAgent.endpointingMs. */
  endpointingMs: number;
}

export const DEFAULT_VAD: VadConfig = {
  energyThreshold: 0.02,
  speechStartMs: 120,
  endpointingMs: 800,
};

/**
 * Stricter config for barge-in detection while the AI is speaking: a higher energy floor and a
 * longer speech-start debounce reject coughs, clicks, and caller-speakerphone echo of our own
 * TTS (the mixing bridge already delivers mix-minus-self, so this is belt-and-suspenders).
 */
export const BARGE_VAD: VadConfig = {
  energyThreshold: 0.05,
  speechStartMs: 200,
  endpointingMs: 800,
};

export type VadEvent = "start" | "end" | null;

/** Streaming utterance detector. Feed 20 ms frames; get "start"/"end" edges. */
export class Vad {
  private speaking = false;
  private speechRun = 0; // ms of consecutive speech while idle
  private silenceRun = 0; // ms of consecutive silence while speaking
  private readonly startFrames: number;
  private readonly endFrames: number;

  constructor(private readonly cfg: VadConfig = DEFAULT_VAD) {
    this.startFrames = Math.max(1, Math.round(cfg.speechStartMs / FRAME_MS));
    this.endFrames = Math.max(1, Math.round(cfg.endpointingMs / FRAME_MS));
  }

  /** Whether the detector currently believes the caller is speaking. */
  get isSpeaking(): boolean {
    return this.speaking;
  }

  /** Feed one frame. Returns "start" on the leading edge, "end" on endpointing, else null. */
  push(frame: Buffer): VadEvent {
    const speech = frameEnergy(frame) >= this.cfg.energyThreshold;
    if (!this.speaking) {
      if (speech) {
        this.speechRun += FRAME_MS;
        if (this.speechRun >= this.startFrames * FRAME_MS) {
          this.speaking = true;
          this.speechRun = 0;
          this.silenceRun = 0;
          return "start";
        }
      } else {
        this.speechRun = 0;
      }
      return null;
    }
    // speaking → look for endpointing silence
    if (speech) {
      this.silenceRun = 0;
    } else {
      this.silenceRun += FRAME_MS;
      if (this.silenceRun >= this.endFrames * FRAME_MS) {
        this.speaking = false;
        this.silenceRun = 0;
        this.speechRun = 0;
        return "end";
      }
    }
    return null;
  }

  reset(): void {
    this.speaking = false;
    this.speechRun = 0;
    this.silenceRun = 0;
  }
}

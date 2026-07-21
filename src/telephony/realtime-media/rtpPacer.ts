// Paces AI audio out to Asterisk on a steady 20 ms clock. One continuous clock runs for the whole
// call: it sends the next queued TTS frame, or a comfort-silence frame on underrun / between
// utterances (seq + timestamp always advance — a stalled clock causes audible gaps + RTP
// discontinuities the far end mishandles). Self-correcting via an absolute-time schedule (never
// setInterval, which drifts). `flush()` = barge-in (drop the queued utterance, keep the clock);
// `stop()` = teardown (kill the clock). Both idempotent. Worker-safe.
import { performance } from "node:perf_hooks";
import { RtpFramer, toFrames, BYTES_PER_FRAME, FRAME_MS } from "./rtp";
import type { RtpTransport } from "./rtpTransport";

const PREBUFFER_FRAMES = 3; // 60 ms jitter cushion before the first audio of an utterance
// Safety cap on buffered audio. A single spoken reply is short (bounded by the brain's max_tokens),
// and TTS streams faster than real-time, so the whole utterance is normally queued in one burst and
// then drained over the 20 ms clock — the cap must be well above any real utterance or its tail gets
// clipped (and the turn ends early). 60 s is a runaway backstop, not a per-utterance limit.
const MAX_QUEUE = 3000; // ~60 s
const SILENCE = Buffer.alloc(BYTES_PER_FRAME);

export class RtpPacer {
  private queue: Buffer[] = [];
  private residual = Buffer.alloc(0); // leftover < 1 frame carried across enqueues (byte alignment)
  private readonly framer: RtpFramer;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private startAt = 0;
  private tickN = 0;
  private running = false;
  private primed = false;
  private finishing = false;
  private inTalkspurt = false;
  private warnedFull = false;
  private drainedCb: (() => void) | null = null;

  constructor(
    private readonly transport: Pick<RtpTransport, "send" | "payloadType">,
    ssrc: number,
  ) {
    this.framer = new RtpFramer(ssrc, transport.payloadType);
  }

  /** Fired when the queue drains after finish() — i.e. the AI finished speaking its turn. */
  onDrained(cb: () => void): void {
    this.drainedCb = cb;
  }

  get queued(): number {
    return this.queue.length;
  }

  /** Add TTS PCM (arbitrary length). Byte-aligned to 20 ms frames; excess dropped (backpressure). */
  enqueue(pcm: Buffer): void {
    if (!this.running) return;
    const buf = this.residual.length ? Buffer.concat([this.residual, pcm]) : pcm;
    const whole = Math.floor(buf.length / BYTES_PER_FRAME) * BYTES_PER_FRAME;
    this.residual = Buffer.from(buf.subarray(whole));
    for (let off = 0; off < whole; off += BYTES_PER_FRAME) {
      if (this.queue.length >= MAX_QUEUE) {
        if (!this.warnedFull) {
          this.warnedFull = true;
          console.warn(`[pacer] audio queue hit ${MAX_QUEUE} frames (~60s) — dropping tail (runaway TTS?)`);
        }
        break;
      }
      this.queue.push(Buffer.from(buf.subarray(off, off + BYTES_PER_FRAME)));
    }
  }

  /** The current utterance is fully enqueued — pad+flush the tail and drain to onDrained. */
  finish(): void {
    if (!this.running) return;
    if (this.residual.length) {
      const [f] = toFrames(this.residual);
      if (f) this.queue.push(f);
      this.residual = Buffer.alloc(0);
    }
    this.finishing = true;
    // A finish() with nothing queued (e.g. brain produced only an action) drains immediately.
    if (this.queue.length === 0) {
      this.finishing = false;
      const cb = this.drainedCb;
      if (cb) queueMicrotask(cb);
    }
  }

  /** Barge-in: drop the queued utterance; the clock keeps running (comfort silence). */
  flush(): void {
    this.queue.length = 0;
    this.residual = Buffer.alloc(0);
    this.finishing = false;
    this.inTalkspurt = false;
    this.primed = false;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startAt = performance.now();
    this.tickN = 0;
    this.scheduleNext();
  }

  /** Teardown — permanently stop the clock and drop everything. Idempotent. */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.queue.length = 0;
    this.residual = Buffer.alloc(0);
  }

  private scheduleNext(): void {
    if (!this.running) return;
    const now = performance.now();
    let target = this.startAt + this.tickN * FRAME_MS;
    // If we fell behind (GC / event-loop stall), resync rather than machine-gunning catch-up frames.
    if (now - target > 3 * FRAME_MS) {
      this.startAt = now - this.tickN * FRAME_MS;
      target = this.startAt + this.tickN * FRAME_MS;
    }
    const delay = Math.max(0, target - now);
    this.timer = setTimeout(() => this.tick(), delay);
  }

  private tick(): void {
    if (!this.running) return;
    this.tickN++;

    if (!this.primed && (this.queue.length >= PREBUFFER_FRAMES || this.finishing)) {
      this.primed = true;
    }

    if (this.primed && this.queue.length > 0) {
      const pcm = this.queue.shift()!;
      const marker = !this.inTalkspurt; // first frame of a talkspurt
      this.inTalkspurt = true;
      this.transport.send(this.framer.frame(pcm, marker));
      if (this.queue.length === 0 && this.finishing) {
        this.finishing = false;
        this.primed = false;
        this.inTalkspurt = false;
        const cb = this.drainedCb;
        if (cb) queueMicrotask(cb);
      }
    } else {
      this.inTalkspurt = false;
      this.transport.send(this.framer.frame(SILENCE, false));
    }

    this.scheduleNext();
  }
}

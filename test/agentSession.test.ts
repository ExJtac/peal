import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentSession, type AgentIO } from "@/telephony/realtime-media/agentSession";
import type { AgentConfig } from "@/telephony/realtime-media/agentConfig";
import { agentByCaller, registerAgent } from "@/telephony/realtime-media/agentRegistry";
import { mockRealtimeLlmProvider } from "@/ai/providers/llm/mockRealtimeLlm";
import { BYTES_PER_FRAME, SAMPLES_PER_FRAME } from "@/telephony/realtime-media/rtp";

const flush = async () => {
  for (let r = 0; r < 4; r++) {
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await new Promise((res) => setTimeout(res, 0));
  }
};

function tone(amp: number): Buffer {
  const b = Buffer.alloc(BYTES_PER_FRAME);
  for (let i = 0; i < SAMPLES_PER_FRAME; i++) b.writeInt16LE(amp, i * 2);
  return b;
}
const SPEECH = tone(9000);
const SILENCE = Buffer.alloc(BYTES_PER_FRAME);

function baseConfig(over: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: "agent1",
    name: "Front Desk",
    greeting: "Thanks for calling.",
    systemPrompt: "You are a receptionist.",
    voice: undefined,
    model: "mock",
    maxTurns: 12,
    endpointingMs: 200, // 10 silent frames ends a turn (keeps tests short)
    bargeIn: true,
    noInputTimeoutMs: 60_000, // long enough not to fire mid-test
    maxReprompts: 2,
    allowTransfer: true,
    transferType: "RING_GROUP",
    transferId: "rg1",
    allowVoicemail: true,
    voicemailExtId: "ext-vm",
    fallbackType: "EXTENSION",
    fallbackId: "ext-op",
    ...over,
  };
}

function harness(config = baseConfig(), opts: { autoDrain?: boolean } = {}) {
  const autoDrain = opts.autoDrain !== false;
  const ari = {
    answer: vi.fn().mockResolvedValue(undefined),
    hangup: vi.fn().mockResolvedValue(undefined),
    createBridge: vi.fn().mockResolvedValue({ id: "br1" }),
    addToBridge: vi.fn().mockResolvedValue(undefined),
    removeFromBridge: vi.fn().mockResolvedValue(undefined),
    destroyBridge: vi.fn().mockResolvedValue(undefined),
    externalMedia: vi.fn().mockResolvedValue({ id: "em1" }),
    play: vi.fn().mockResolvedValue(undefined),
    setVar: vi.fn().mockResolvedValue(undefined),
  };

  let onReady = () => {};
  let onFrame: (b: Buffer) => void = () => {};
  const transport = {
    send: vi.fn(),
    payloadType: 118,
    port: 40000,
    close: vi.fn(),
    onReady: (cb: () => void) => (onReady = cb),
    onFrame: (cb: (b: Buffer) => void) => (onFrame = cb),
    ready: () => onReady(),
    feed: (b: Buffer) => onFrame(b),
  };

  const pacer = {
    frames: [] as Buffer[],
    started: false,
    stopped: false,
    flushed: 0,
    finished: false,
    _drained: null as null | (() => void),
    enqueue(b: Buffer) {
      this.frames.push(b);
    },
    finish() {
      this.finished = true;
      // The real pacer fires onDrained once the queue empties after finish(); emulate that so the
      // state machine auto-advances (greeting→listen, terminal action→execute) without a manual clock.
      // Tests that need to interpose a barge-in before the drain pass autoDrain:false.
      if (autoDrain) queueMicrotask(() => this._drained?.());
    },
    flush() {
      this.flushed++;
      this.frames.length = 0;
    },
    start() {
      this.started = true;
    },
    stop() {
      this.stopped = true;
    },
    onDrained(cb: () => void) {
      this._drained = cb;
    },
    get queued() {
      return this.frames.length;
    },
    drain() {
      this._drained?.();
    },
  };

  let nextTranscript = "";
  let sttClosed = false;
  const stt = {
    say: (t: string) => (nextTranscript = t),
  };
  const sttProvider = {
    name: "mock",
    openStream(cb: { onFinal: (t: string) => void }) {
      return {
        pushPcm() {},
        finalizeUtterance() {
          if (sttClosed || !nextTranscript) return;
          const t = nextTranscript;
          nextTranscript = "";
          queueMicrotask(() => {
            if (!sttClosed) cb.onFinal(t);
          });
        },
        close() {
          sttClosed = true;
        },
      };
    },
  };

  const tts = {
    name: "mock",
    async *synthesize(_text: string, { signal }: { signal: AbortSignal }) {
      if (signal.aborted) return;
      yield Buffer.alloc(BYTES_PER_FRAME, 1);
      await Promise.resolve();
      if (signal.aborted) return;
      yield Buffer.alloc(BYTES_PER_FRAME, 1);
    },
  };

  const io: AgentIO = {
    ari,
    transport,
    tts,
    brain: mockRealtimeLlmProvider,
    sttProvider,
    makePacer: () => pacer,
    resolveDestination: vi.fn().mockResolvedValue(undefined),
    persistDialogue: vi.fn().mockResolvedValue(undefined),
  };

  const session = new AgentSession(config, { callerChannelId: "caller1", emChannelId: "em1", bridgeId: "br1" }, "call1", io);
  registerAgent(session);
  session.begin();

  async function turn(text: string) {
    stt.say(text);
    for (let i = 0; i < 6; i++) transport.feed(SPEECH);
    for (let i = 0; i < 12; i++) transport.feed(SILENCE);
    await flush(); // STT final → brain → TTS → pacer.finish() → (auto drain) → next state
  }

  return { session, io, ari, transport, pacer, stt, turn };
}

describe("AgentSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("greets, then normally ends the call and frees ALL resources", async () => {
    const h = harness();
    h.transport.ready(); // externalMedia connected → greeting plays
    await flush();
    expect(h.pacer.started).toBe(true);
    expect(h.pacer.frames.length).toBeGreaterThan(0); // greeting audio queued

    await h.turn("no thanks, goodbye"); // → end_call

    // teardown ordering: em channel ALWAYS hung up (frees the RTP port), bridge destroyed,
    // caller hung up (normal), transport closed, dialogue persisted, registry cleared.
    expect(h.ari.hangup).toHaveBeenCalledWith("em1");
    expect(h.ari.hangup).toHaveBeenCalledWith("caller1");
    expect(h.ari.destroyBridge).toHaveBeenCalledWith("br1");
    expect(h.transport.close).toHaveBeenCalledTimes(1);
    expect(h.pacer.stopped).toBe(true);
    expect(h.io.persistDialogue).toHaveBeenCalledWith("call1", expect.stringContaining("Caller: no thanks, goodbye"), "HANDLED");
    expect(agentByCaller("caller1")).toBeUndefined();
  });

  it("transfers to a human without hanging up the caller", async () => {
    const h = harness();
    h.transport.ready();
    await flush();

    await h.turn("can I speak to a person"); // → transfer_to_human

    expect(h.io.resolveDestination).toHaveBeenCalledWith("RING_GROUP", "rg1", "caller1", "call1");
    expect(h.ari.removeFromBridge).toHaveBeenCalledWith("br1", "caller1");
    expect(h.ari.setVar).toHaveBeenCalledWith("caller1", "AGENT_ACTIVE", "0");
    expect(h.ari.hangup).toHaveBeenCalledWith("em1"); // media leg freed
    expect(h.ari.hangup).not.toHaveBeenCalledWith("caller1"); // caller survives the handoff
    expect(h.io.persistDialogue).toHaveBeenCalledWith("call1", expect.any(String), "TRANSFERRED");
  });

  it("takes a message via voicemail", async () => {
    const h = harness();
    h.transport.ready();
    await flush();

    await h.turn("please take a message"); // → take_message

    expect(h.io.resolveDestination).toHaveBeenCalledWith("VOICEMAIL", "ext-vm", "caller1", "call1");
    expect(h.ari.hangup).not.toHaveBeenCalledWith("caller1");
  });

  it("barges in when the caller talks over the greeting", async () => {
    const h = harness();
    h.transport.ready(); // state = GREETING (greeting TTS just started, not yet drained)
    // caller interrupts during GREETING before any flush (BARGE_VAD needs ~10 speech frames)
    for (let i = 0; i < 12; i++) h.transport.feed(SPEECH);
    expect(h.pacer.flushed).toBeGreaterThanOrEqual(1); // AI audio cut off immediately
    await flush(); // the greeting's in-flight TTS is dropped (turnId bumped) — no auto-drain

    // proves we're now LISTENING: a following utterance is processed end-to-end
    await h.turn("goodbye");
    expect(h.io.persistDialogue).toHaveBeenCalled();
  });

  it("DTMF 0 transfers to the operator immediately, bypassing the brain", async () => {
    const h = harness();
    h.transport.ready();
    await flush();

    h.session.onDtmf("0");
    await flush();

    expect(h.io.resolveDestination).toHaveBeenCalledWith("RING_GROUP", "rg1", "caller1", "call1");
  });

  it("handles caller hangup mid-call and is idempotent", async () => {
    const h = harness();
    h.transport.ready();
    await flush();

    await h.session.handleChannelGone("caller1");
    await h.session.handleChannelGone("caller1"); // second event → no-op

    expect(h.ari.hangup).toHaveBeenCalledWith("em1"); // media freed even though caller is gone
    expect(h.ari.hangup).not.toHaveBeenCalledWith("caller1"); // already gone — don't re-hang
    expect(h.ari.hangup.mock.calls.filter((c) => c[0] === "em1")).toHaveLength(1); // exactly once
    expect(h.ari.destroyBridge).toHaveBeenCalledTimes(1);
    expect(h.io.persistDialogue).toHaveBeenCalledWith("call1", expect.any(String), "HANGUP");
    expect(agentByCaller("caller1")).toBeUndefined();
  });

  it("reroutes to fallback when the externalMedia leg dies", async () => {
    const h = harness();
    h.transport.ready();
    await flush();

    await h.session.handleChannelGone("em1"); // media leg destroyed
    await flush();

    expect(h.ari.play).toHaveBeenCalledWith("caller1", expect.stringContaining("sound:")); // pre-baked apology
    expect(h.io.resolveDestination).toHaveBeenCalledWith("EXTENSION", "ext-op", "caller1", "call1"); // fallback
  });

  it("connect timeout with no media reroutes to fallback", async () => {
    vi.useFakeTimers();
    const h = harness();
    // never call transport.ready() — media never connects
    await vi.advanceTimersByTimeAsync(3100);
    vi.useRealTimers();
    await flush();
    expect(h.io.resolveDestination).toHaveBeenCalledWith("EXTENSION", "ext-op", "caller1", "call1");
  });

  // --- regression: review findings ---

  it("barge-in cancels a pending terminal action so it never fires on a later drain", async () => {
    const h = harness(baseConfig(), { autoDrain: false }); // manual drain so we can interpose the barge
    h.transport.ready();
    await flush();
    h.pacer.drain(); // greeting → LISTENING
    await flush();

    // A turn resolves to transfer_to_human: pendingTerminal is set, state SPEAKING, audio queued.
    h.stt.say("can I speak to a person");
    for (let i = 0; i < 6; i++) h.transport.feed(SPEECH);
    for (let i = 0; i < 12; i++) h.transport.feed(SILENCE);
    await flush();

    // Caller barges in during SPEAKING to cancel it, then goes silent.
    for (let i = 0; i < 12; i++) h.transport.feed(SPEECH);
    await flush();

    // Any later drain (e.g. a reprompt) must NOT execute the cancelled transfer.
    h.pacer.drain();
    await flush();
    expect(h.io.resolveDestination).not.toHaveBeenCalled();
  });

  it("concurrent terminal events route the caller only once (fallback re-entrancy)", async () => {
    const h = harness();
    h.transport.ready();
    await flush();

    // Two ChannelDestroyed(emChannel) events (or shutdown + em-gone) racing → both call fallback().
    const p1 = h.session.handleChannelGone("em1");
    const p2 = h.session.handleChannelGone("em1");
    await Promise.all([p1, p2]);
    await flush();

    // resolveDestination (the only non-idempotent effect) must fire exactly once.
    expect(h.io.resolveDestination).toHaveBeenCalledTimes(1);
    expect(h.io.resolveDestination).toHaveBeenCalledWith("EXTENSION", "ext-op", "caller1", "call1");
  });
});

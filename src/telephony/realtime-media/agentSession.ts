// The real-time AI receptionist orchestrator. One instance per AI call. It drives the media loop
// (externalMedia RTP ↔ VAD/STT ↔ Claude brain ↔ TTS) and the turn state machine:
//
//   CONNECTING_MEDIA → GREETING → LISTENING → THINKING → SPEAKING → LISTENING … → CLOSED
//
// Two guards make every async callback safe: a monotonic `turnId` (bumped on barge-in + teardown,
// so a late TTS/brain/STT callback from a finished turn no-ops) and a `closed` flag (no effect
// runs after teardown). Teardown is idempotent and ALWAYS hangs up the externalMedia channel —
// leaking it would exhaust Asterisk's RTP port pool system-wide. All I/O is injected (`AgentIO`)
// so the state machine is unit-testable with mocks. Worker-safe.
import { ari } from "../ariClient";
import { markAnswered } from "../callRecord";
import { db } from "@/lib/db";
import { MEDIA_HOST } from "@/lib/env";
import type { AiOutcome, DestinationType } from "@prisma/client";
import { Vad, DEFAULT_VAD, BARGE_VAD } from "./vad";
import { RtpPacer } from "./rtpPacer";
import { allocateTransport, type RtpTransport } from "./rtpTransport";
import { resolveStreamingStt } from "@/ai/providers/stt/resolve";
import { resolveTts } from "@/ai/providers/tts/resolve";
import { resolveRealtimeLlm } from "@/ai/providers/llm/resolve";
import type { TtsProvider } from "@/ai/providers/tts/ttsProvider";
import type { RealtimeLlmProvider, BrainTurn, AgentToolName } from "@/ai/providers/llm/realtimeLlmProvider";
import type { SttStreamHandle, StreamingSttProvider } from "@/ai/providers/stt/streamingSttProvider";
import { registerAgent, unregisterAgent, type RegisteredAgent } from "./agentRegistry";
import { toolsFor } from "./agentTools";
import { loadAgentConfig, type AgentConfig } from "./agentConfig";

const MEDIA_TIMEOUT_MS = 3000; // externalMedia should send RTP within ~40ms; this is the safety net
const PREROLL_FRAMES = 15; // ~300ms of caller audio kept so barge-in doesn't clip the first word
const OPERATOR_DTMF = "0";
const FALLBACK_SOUND = "sound:sorry"; // pre-baked; never TTS on a failure path

type AgentState = "CONNECTING_MEDIA" | "GREETING" | "LISTENING" | "THINKING" | "SPEAKING" | "CLOSED";

type AriLike = Pick<
  typeof ari,
  "answer" | "hangup" | "createBridge" | "addToBridge" | "removeFromBridge" | "destroyBridge" | "externalMedia" | "play" | "setVar"
>;
type TransportLike = Pick<RtpTransport, "send" | "payloadType" | "onReady" | "onFrame" | "close" | "port">;
type PacerLike = Pick<RtpPacer, "enqueue" | "finish" | "flush" | "start" | "stop" | "onDrained" | "queued">;

export interface AgentIO {
  ari: AriLike;
  transport: TransportLike;
  tts: TtsProvider;
  brain: RealtimeLlmProvider;
  sttProvider: StreamingSttProvider;
  makePacer: (transport: Pick<RtpTransport, "send" | "payloadType">, ssrc: number) => PacerLike;
  resolveDestination: (type: DestinationType, id: string | null, callerChannelId: string, callRecordId: string) => Promise<void>;
  persistDialogue: (callRecordId: string, text: string, outcome: AiOutcome) => Promise<void>;
}

export interface AgentChannels {
  callerChannelId: string;
  emChannelId: string;
  bridgeId: string;
}

export class AgentSession implements RegisteredAgent {
  readonly callerChannelId: string;
  readonly emChannelId: string;
  private readonly bridgeId: string;

  private state: AgentState = "CONNECTING_MEDIA";
  private turnId = 0;
  private turnCount = 0;
  private reprompts = 0;
  private closed = false;
  private persisted = false;
  private terminating = false; // set synchronously the moment a terminal transition begins
  private handedOff = false; // ensures resolveDestination (transfer/voicemail/fallback) runs ONCE

  private pacer: PacerLike | null = null;
  private stt: SttStreamHandle | null = null;
  private ttsAbort: AbortController | null = null;
  private brainAbort: AbortController | null = null;

  private readonly listenVad: Vad;
  private readonly bargeVad = new Vad(BARGE_VAD);
  private readonly preRoll: Buffer[] = [];
  private readonly history: BrainTurn[] = [];
  private readonly ssrc = Math.floor(Math.random() * 0xffffffff) >>> 0;

  private pendingTerminal: { tool: AgentToolName; input: Record<string, unknown> } | null = null;
  private mediaTimer: ReturnType<typeof setTimeout> | null = null;
  private noInputTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly config: AgentConfig,
    channels: AgentChannels,
    private readonly callRecordId: string,
    private readonly io: AgentIO,
  ) {
    this.callerChannelId = channels.callerChannelId;
    this.emChannelId = channels.emChannelId;
    this.bridgeId = channels.bridgeId;
    this.listenVad = new Vad({ ...DEFAULT_VAD, endpointingMs: config.endpointingMs });
  }

  /** Wire the media transport and arm the connect-timeout. Call once, right after construction. */
  begin(): void {
    this.io.transport.onReady(() => this.onMediaReady());
    this.io.transport.onFrame((pcm) => this.onInboundFrame(pcm));
    this.mediaTimer = setTimeout(() => {
      if (!this.closed && this.state === "CONNECTING_MEDIA") void this.fallback("FALLBACK");
    }, MEDIA_TIMEOUT_MS);
  }

  // --- inbound media -------------------------------------------------------

  private onMediaReady(): void {
    if (this.closed || this.state !== "CONNECTING_MEDIA") return;
    this.clearMediaTimer();
    this.pacer = this.io.makePacer(this.io.transport, this.ssrc);
    this.pacer.onDrained(() => this.onSpeechDrained());
    this.pacer.start();
    this.stt = this.io.sttProvider.openStream({
      onFinal: (t) => this.onSttFinal(t),
      onError: () => {}, // a dead STT surfaces as no transcript → NOINPUT reprompt → fallback
    });
    this.state = "GREETING";
    this.speakSingle(this.config.greeting);
  }

  private onInboundFrame(pcm: Buffer): void {
    if (this.closed) return;
    this.preRoll.push(pcm);
    if (this.preRoll.length > PREROLL_FRAMES) this.preRoll.shift();

    if (this.state === "GREETING" || this.state === "SPEAKING") {
      if (this.config.bargeIn && this.bargeVad.push(pcm) === "start") this.bargeIn();
    } else if (this.state === "LISTENING") {
      this.stt?.pushPcm(pcm);
      const ev = this.listenVad.push(pcm);
      if (ev === "start") this.clearNoInput();
      else if (ev === "end") this.stt?.finalizeUtterance();
    }
  }

  /** Caller talked over the AI: kill this turn's audio + producers, replay pre-roll, start listening. */
  private bargeIn(): void {
    if (this.closed) return;
    this.turnId++; // invalidate in-flight TTS/brain callbacks for the old turn
    this.pendingTerminal = null; // the caller cancelled this turn — its terminal action must NOT fire later
    this.pacer?.flush(); // what the caller hears stop
    this.ttsAbort?.abort();
    this.brainAbort?.abort();
    this.bargeVad.reset();
    this.listenVad.reset();
    this.state = "LISTENING";
    for (const f of this.preRoll) this.stt?.pushPcm(f); // don't clip the caller's first word
    this.armNoInput();
  }

  // --- turn taking ---------------------------------------------------------

  private onSttFinal(text: string): void {
    if (this.closed || this.state !== "LISTENING") return;
    const t = text.trim();
    if (t) this.think(t);
  }

  private think(transcript: string): void {
    if (this.closed) return;
    this.clearNoInput();
    this.reprompts = 0;
    this.turnCount++;
    if (this.turnCount > this.config.maxTurns) {
      this.history.push({ role: "user", content: transcript });
      void this.fallback("FALLBACK");
      return;
    }
    this.state = "THINKING";
    const myTurn = this.turnId;
    this.brainAbort = new AbortController();
    this.ttsAbort = new AbortController();

    void (async () => {
      let assistantText = "";
      let terminal: { tool: AgentToolName; input: Record<string, unknown> } | null = null;
      try {
        const stream = this.io.brain.respond(transcript, this.history, {
          signal: this.brainAbort!.signal,
          systemPrompt: this.config.systemPrompt,
          tools: toolsFor(this.config),
          model: this.config.model,
        });
        for await (const ev of stream) {
          if (this.closed || myTurn !== this.turnId) return;
          if (ev.kind === "say") {
            if (this.state === "THINKING") this.state = "SPEAKING";
            assistantText += (assistantText ? " " : "") + ev.sentence;
            for await (const chunk of this.io.tts.synthesize(ev.sentence, { signal: this.ttsAbort!.signal, voice: this.config.voice })) {
              if (this.closed || myTurn !== this.turnId) return;
              this.pacer?.enqueue(chunk);
            }
          } else {
            if (ev.tool === "answer_question") continue; // conversational — keep going
            terminal = { tool: ev.tool, input: ev.input };
            break;
          }
        }
      } catch {
        if (this.closed || myTurn !== this.turnId) return;
        void this.fallback("ERROR");
        return;
      }
      if (this.closed || myTurn !== this.turnId) return;
      this.history.push({ role: "user", content: transcript });
      if (assistantText) this.history.push({ role: "assistant", content: assistantText });
      this.pendingTerminal = terminal;
      if (this.state === "THINKING") this.state = "SPEAKING"; // no speech (pure action) — still drain→transition
      this.pacer?.finish();
    })();
  }

  /** The pacer drained the current utterance (greeting / answer / reprompt / closing). */
  private onSpeechDrained(): void {
    if (this.closed) return;
    const term = this.pendingTerminal;
    this.pendingTerminal = null;
    if (term) {
      void this.executeTerminal(term.tool);
      return;
    }
    this.toListening();
  }

  private toListening(): void {
    if (this.closed) return;
    this.turnId++;
    this.state = "LISTENING";
    this.listenVad.reset();
    this.armNoInput();
  }

  /** Synthesize one standalone line (greeting / reprompt) — no brain, then drain→listen. */
  private speakSingle(text: string): void {
    const myTurn = this.turnId;
    this.ttsAbort = new AbortController();
    void (async () => {
      try {
        for await (const chunk of this.io.tts.synthesize(text, { signal: this.ttsAbort!.signal, voice: this.config.voice })) {
          if (this.closed || myTurn !== this.turnId) return;
          this.pacer?.enqueue(chunk);
        }
        if (!this.closed && myTurn === this.turnId) this.pacer?.finish();
      } catch {
        if (!this.closed && myTurn === this.turnId) this.toListening();
      }
    })();
  }

  // --- actions -------------------------------------------------------------

  private async executeTerminal(tool: AgentToolName): Promise<void> {
    switch (tool) {
      case "end_call":
        return this.hangupNormally("HANDLED");
      case "transfer_to_human":
        if (this.config.allowTransfer && this.config.transferType) {
          return this.handoff(this.config.transferType, this.config.transferId, "TRANSFERRED");
        }
        return this.fallback("FALLBACK");
      case "take_message":
        if (this.config.allowVoicemail && this.config.voicemailExtId) {
          return this.handoff("VOICEMAIL", this.config.voicemailExtId, "VOICEMAIL");
        }
        return this.fallback("FALLBACK");
      default:
        this.toListening();
    }
  }

  private async hangupNormally(outcome: AiOutcome): Promise<void> {
    await this.persistAndFinalize(outcome);
    await this.teardown("normal");
  }

  /** Keep the caller alive, tear down media, then route them onward (transfer / voicemail / fallback). */
  private async handoff(type: DestinationType, id: string | null, outcome: AiOutcome): Promise<void> {
    if (this.handedOff) return; // resolveDestination must run at most once (two events could both reach here)
    this.handedOff = true;
    await this.persistAndFinalize(outcome);
    await this.teardown("handoff");
    await this.io.resolveDestination(type, id, this.callerChannelId, this.callRecordId).catch(() => {});
  }

  private async fallback(outcome: AiOutcome): Promise<void> {
    // Synchronous guard BEFORE the first await — two events (em-gone + brain-error, shutdown + …)
    // can both pass a plain `closed` check while the first is parked on `await play`.
    if (this.closed || this.terminating) return;
    this.terminating = true;
    await this.io.ari.play(this.callerChannelId, FALLBACK_SOUND).catch(() => {});
    if (this.config.fallbackType) return this.handoff(this.config.fallbackType, this.config.fallbackId, outcome);
    if (this.config.allowVoicemail && this.config.voicemailExtId) return this.handoff("VOICEMAIL", this.config.voicemailExtId, outcome);
    await this.persistAndFinalize(outcome);
    await this.teardown("normal");
  }

  // --- DTMF + lifecycle events (from the dispatcher) -----------------------

  onDtmf(digit: string): void {
    if (this.closed || !this.pacer) return; // ignore DTMF until media is up (CONNECTING_MEDIA)
    if (this.state === "GREETING" || this.state === "SPEAKING") this.bargeIn();
    if (digit === OPERATOR_DTMF) {
      void this.executeTerminal("transfer_to_human");
      return;
    }
    if (this.state !== "THINKING") this.think(`[caller pressed ${digit}]`);
  }

  /** A channel we own was destroyed (dispatcher ChannelDestroyed). */
  async handleChannelGone(channelId: string): Promise<void> {
    if (this.closed) return;
    if (channelId === this.callerChannelId) {
      await this.persistAndFinalize("HANGUP");
      return this.teardown("caller-hangup");
    }
    if (channelId === this.emChannelId) {
      return this.fallback("FALLBACK"); // media leg died — reroute the still-live caller
    }
  }

  /** Graceful daemon shutdown — best-effort reroute; the recovery sweep is the real guarantee. */
  async shutdown(): Promise<void> {
    if (this.closed) return;
    await this.io.ari.setVar(this.callerChannelId, "AGENT_INTERRUPTED", "1").catch(() => {});
    await this.fallback("FALLBACK");
  }

  // --- teardown (idempotent; ALWAYS frees the externalMedia channel) -------

  private async teardown(reason: "normal" | "caller-hangup" | "handoff"): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.turnId++;
    this.state = "CLOSED";
    // 1) stop local producers + timers before touching remote resources
    this.pacer?.stop();
    this.ttsAbort?.abort();
    this.brainAbort?.abort();
    try {
      this.stt?.close();
    } catch {
      /* ignore */
    }
    this.io.transport.close();
    this.clearMediaTimer();
    this.clearNoInput();
    // 2) remote resources
    if (reason === "handoff") {
      await this.io.ari.setVar(this.callerChannelId, "AGENT_ACTIVE", "0").catch(() => {});
      await this.io.ari.removeFromBridge(this.bridgeId, this.callerChannelId).catch(() => {}); // free caller for the next bridge
    }
    await this.io.ari.hangup(this.emChannelId).catch(() => {}); // ALWAYS — frees the RTP port
    await this.io.ari.destroyBridge(this.bridgeId).catch(() => {});
    unregisterAgent(this.callerChannelId, this.emChannelId);
    if (reason === "normal") await this.io.ari.hangup(this.callerChannelId).catch(() => {});
  }

  private async persistAndFinalize(outcome: AiOutcome): Promise<void> {
    if (this.persisted) return;
    this.persisted = true;
    const text = this.history.map((h) => `${h.role === "user" ? "Caller" : "Agent"}: ${h.content}`).join("\n");
    await this.io.persistDialogue(this.callRecordId, text, outcome).catch(() => {});
  }

  private armNoInput(): void {
    this.clearNoInput();
    this.noInputTimer = setTimeout(() => this.onNoInput(), this.config.noInputTimeoutMs);
  }
  private onNoInput(): void {
    if (this.closed || this.state !== "LISTENING") return;
    this.reprompts++;
    if (this.reprompts > this.config.maxReprompts) {
      void this.fallback("FALLBACK");
      return;
    }
    this.state = "SPEAKING";
    this.speakSingle("Are you still there?");
  }
  private clearNoInput(): void {
    if (this.noInputTimer) {
      clearTimeout(this.noInputTimer);
      this.noInputTimer = null;
    }
  }
  private clearMediaTimer(): void {
    if (this.mediaTimer) {
      clearTimeout(this.mediaTimer);
      this.mediaTimer = null;
    }
  }
}

// --- production wiring -------------------------------------------------------

async function persistDialogue(callRecordId: string, text: string, outcome: AiOutcome): Promise<void> {
  await db.callRecord.update({ where: { id: callRecordId }, data: { aiOutcome: outcome, disposition: "ANSWERED" } }).catch(() => {});
  await db.transcript.create({ data: { callRecordId, text, engine: "realtime-agent" } }).catch(() => {});
}

/**
 * Entry point (called from destinations.resolveDestination for an AI_AGENT destination). Answers
 * the caller, builds the mixing bridge, attaches an externalMedia leg, and starts the session.
 * On any setup failure the caller is not stranded — hang up (a control-plane failure, rare).
 */
export async function startAgentSession(callerChannelId: string, agentId: string | null, callRecordId: string): Promise<void> {
  const config = agentId ? await loadAgentConfig(agentId) : null;
  if (!config) {
    await ari.play(callerChannelId, "sound:sorry").catch(() => {});
    await ari.hangup(callerChannelId).catch(() => {});
    return;
  }

  const transport = await allocateTransport().catch(() => null);
  if (!transport) {
    await ari.hangup(callerChannelId).catch(() => {});
    return;
  }

  // Hoisted so the catch can tear them down — a failure AFTER externalMedia is created would
  // otherwise orphan the UnicastRTP channel and permanently burn an RTP port (the #1 pitfall).
  let bridge: { id: string } | null = null;
  let em: { id: string } | null = null;
  try {
    await ari.answer(callerChannelId);
    bridge = await ari.createBridge("mixing");
    await ari.addToBridge(bridge.id, callerChannelId);
    em = await ari.externalMedia({ external_host: `${MEDIA_HOST}:${transport.port}`, format: "slin16" });
    await ari.addToBridge(bridge.id, em.id);

    // Durable state for daemon-restart recovery (stateRecovery reads these off the caller channel).
    await ari.setVar(callerChannelId, "AGENT_ACTIVE", "1").catch(() => {});
    await ari.setVar(callerChannelId, "AGENT_EM_CHANNEL", em.id).catch(() => {});
    await ari.setVar(callerChannelId, "AGENT_BRIDGE", bridge.id).catch(() => {});
    await ari.setVar(callerChannelId, "AGENT_FALLBACK_TYPE", config.fallbackType ?? "").catch(() => {});
    await ari.setVar(callerChannelId, "AGENT_FALLBACK_ID", config.fallbackId ?? "").catch(() => {});
    await db.callRecord.update({ where: { id: callRecordId }, data: { aiAgentId: config.id } }).catch(() => {});
    await markAnswered(callRecordId).catch(() => {});

    const { resolveDestination } = await import("../destinations");
    const session = new AgentSession(
      config,
      { callerChannelId, emChannelId: em.id, bridgeId: bridge.id },
      callRecordId,
      {
        ari,
        transport,
        tts: resolveTts(),
        brain: resolveRealtimeLlm(),
        sttProvider: resolveStreamingStt(),
        makePacer: (t, ssrc) => new RtpPacer(t, ssrc),
        resolveDestination,
        persistDialogue,
      },
    );
    registerAgent(session);
    session.begin();
  } catch (e) {
    transport.close();
    console.error("[agent] setup failed:", e instanceof Error ? e.message : e);
    if (em) await ari.hangup(em.id).catch(() => {}); // free the externalMedia RTP port
    if (bridge) await ari.destroyBridge(bridge.id).catch(() => {});
    await ari.hangup(callerChannelId).catch(() => {});
  }
}

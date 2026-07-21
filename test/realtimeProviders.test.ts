import { describe, it, expect } from "vitest";
import { mockStreamingSttProvider, MOCK_SCRIPT } from "@/ai/providers/stt/mockStreamingStt";
import { mockTtsProvider } from "@/ai/providers/tts/mockTts";
import { mockRealtimeLlmProvider } from "@/ai/providers/llm/mockRealtimeLlm";
import type { BrainEvent } from "@/ai/providers/llm/realtimeLlmProvider";
import { resolveStreamingStt } from "@/ai/providers/stt/resolve";
import { resolveTts } from "@/ai/providers/tts/resolve";
import { resolveRealtimeLlm } from "@/ai/providers/llm/resolve";
import { BYTES_PER_FRAME } from "@/telephony/realtime-media/rtp";

describe("mock streaming STT", () => {
  it("emits the scripted utterance on finalize, only when audio was fed", async () => {
    const finals: string[] = [];
    const h = mockStreamingSttProvider.openStream({ onFinal: (t) => finals.push(t) });
    h.finalizeUtterance(); // no audio fed → nothing
    await Promise.resolve();
    expect(finals).toEqual([]);

    h.pushPcm(Buffer.alloc(BYTES_PER_FRAME));
    h.finalizeUtterance();
    await Promise.resolve();
    expect(finals).toEqual([MOCK_SCRIPT[0]]);
  });

  it("advances through the script across turns and stops emitting after close", async () => {
    const finals: string[] = [];
    const h = mockStreamingSttProvider.openStream({ onFinal: (t) => finals.push(t) });
    for (let turn = 0; turn < 3; turn++) {
      h.pushPcm(Buffer.alloc(BYTES_PER_FRAME));
      h.finalizeUtterance();
    }
    await Promise.resolve();
    expect(finals).toEqual(MOCK_SCRIPT.slice(0, 3));

    h.close();
    h.pushPcm(Buffer.alloc(BYTES_PER_FRAME));
    h.finalizeUtterance();
    await Promise.resolve();
    expect(finals).toHaveLength(3); // no emission after close
  });
});

describe("mock TTS", () => {
  it("produces PCM sized to the text and stops on abort", async () => {
    const ac = new AbortController();
    const chunks: Buffer[] = [];
    for await (const c of mockTtsProvider.synthesize("hello there friend", { signal: ac.signal })) chunks.push(c);
    const bytes = chunks.reduce((n, c) => n + c.length, 0);
    expect(bytes).toBeGreaterThan(0);
    expect(bytes % 2).toBe(0); // whole int16 samples

    const ac2 = new AbortController();
    ac2.abort();
    const none: Buffer[] = [];
    for await (const c of mockTtsProvider.synthesize("this should not play", { signal: ac2.signal })) none.push(c);
    expect(none).toEqual([]);
  });

  it("longer text yields more audio", async () => {
    const measure = async (text: string) => {
      let n = 0;
      for await (const c of mockTtsProvider.synthesize(text, { signal: new AbortController().signal })) n += c.length;
      return n;
    };
    expect(await measure("one two three four five six")).toBeGreaterThan(await measure("hi"));
  });
});

async function collect(transcript: string): Promise<BrainEvent[]> {
  const out: BrainEvent[] = [];
  for await (const ev of mockRealtimeLlmProvider.respond(transcript, [], {
    signal: new AbortController().signal,
    systemPrompt: "",
    tools: [],
    model: "mock",
  })) {
    out.push(ev);
  }
  return out;
}

describe("mock brain routing", () => {
  it("routes every intent to the right terminal action", async () => {
    const action = (evs: BrainEvent[]) => evs.find((e) => e.kind === "action") as Extract<BrainEvent, { kind: "action" }>;
    expect(action(await collect("can I speak to a person")).tool).toBe("transfer_to_human");
    expect(action(await collect("please take a message")).tool).toBe("take_message");
    expect(action(await collect("goodbye")).tool).toBe("end_call");
    expect(action(await collect("what are your hours")).tool).toBe("answer_question");
    expect(action(await collect("something totally unrelated")).tool).toBe("answer_question");
  });

  it("always speaks at least one sentence before acting", async () => {
    const evs = await collect("can I speak to a person");
    expect(evs[0].kind).toBe("say");
    expect(evs.at(-1)!.kind).toBe("action");
  });

  it("stops emitting when the signal aborts", async () => {
    const ac = new AbortController();
    ac.abort();
    const out: BrainEvent[] = [];
    for await (const ev of mockRealtimeLlmProvider.respond("goodbye", [], {
      signal: ac.signal,
      systemPrompt: "",
      tools: [],
      model: "mock",
    })) {
      out.push(ev);
    }
    expect(out).toEqual([]);
  });
});

describe("realtime provider resolution (mock-default, offline)", () => {
  it("resolves to mocks with no API keys (test/setup.ts clears them)", () => {
    expect(resolveStreamingStt().name).toBe("mock");
    expect(resolveTts().name).toBe("mock");
    expect(resolveRealtimeLlm().name).toBe("mock");
  });
});

import type { AiAgent } from "@prisma/client";
import { saveAiAgent } from "./actions";

// Destination types an AI agent may hand off to (AI_AGENT excluded — no agent→agent loops).
const DEST_TYPES: [string, string][] = [
  ["", "— none —"],
  ["EXTENSION", "Extension"],
  ["RING_GROUP", "Ring group"],
  ["QUEUE", "Queue"],
  ["IVR", "IVR"],
  ["VOICEMAIL", "Voicemail"],
  ["TIME_CONDITION", "Time condition"],
  ["HANGUP", "Hangup"],
];

function DestSelect({ name, value }: { name: string; value?: string | null }) {
  return (
    <select className="select" name={name} defaultValue={value ?? ""}>
      {DEST_TYPES.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

/** Create (no agent) or edit (agent given) form. Server component; native form posting. */
export function AgentForm({ agent }: { agent?: AiAgent }) {
  const a = agent;
  return (
    <form action={saveAiAgent} className="grid grid-cols-2 gap-4">
      {a && <input type="hidden" name="id" value={a.id} />}

      <div className="field">
        <label className="label">Name</label>
        <input className="input" name="name" defaultValue={a?.name ?? ""} placeholder="Front desk" required />
      </div>
      <div className="field flex items-end gap-2">
        <label className="label flex items-center gap-2">
          <input type="checkbox" name="enabled" defaultChecked={a?.enabled ?? true} /> Enabled
        </label>
      </div>

      <div className="field col-span-2">
        <label className="label">Greeting (spoken first)</label>
        <input
          className="input"
          name="greeting"
          defaultValue={a?.greeting ?? ""}
          placeholder="Thanks for calling Acme — how can I help you today?"
          required
        />
      </div>

      <div className="field col-span-2">
        <label className="label">Persona / instructions (system prompt)</label>
        <textarea
          className="input"
          name="systemPrompt"
          rows={3}
          defaultValue={a?.systemPrompt ?? "You are a friendly, concise phone receptionist."}
          required
        />
      </div>

      <div className="field col-span-2">
        <label className="label">Business context / knowledge (optional)</label>
        <textarea
          className="input"
          name="businessContext"
          rows={4}
          defaultValue={a?.businessContext ?? ""}
          placeholder="Hours: Mon–Fri 9–5. Address: 123 Main St. We do plumbing + HVAC. For billing, transfer to accounting…"
        />
        <span className="muted text-xs">Injected into the prompt so the AI can answer FAQs accurately.</span>
      </div>

      <div className="field">
        <label className="label">TTS voice id (optional)</label>
        <input className="input" name="voice" defaultValue={a?.voice ?? ""} placeholder="env default" />
      </div>
      <div className="field">
        <label className="label">Claude model (optional)</label>
        <input className="input" name="llmModel" defaultValue={a?.llmModel ?? ""} placeholder="env default (haiku 4.5)" />
      </div>

      <div className="field">
        <label className="label">Max turns</label>
        <input className="input" type="number" name="maxTurns" defaultValue={a?.maxTurns ?? 12} min={1} />
      </div>
      <div className="field">
        <label className="label">Endpointing silence (ms)</label>
        <input className="input" type="number" name="endpointingMs" defaultValue={a?.endpointingMs ?? 800} min={200} />
      </div>
      <div className="field">
        <label className="label">No-input timeout (ms)</label>
        <input className="input" type="number" name="noInputTimeoutMs" defaultValue={a?.noInputTimeoutMs ?? 7000} min={1000} />
      </div>
      <div className="field">
        <label className="label">Max reprompts</label>
        <input className="input" type="number" name="maxReprompts" defaultValue={a?.maxReprompts ?? 2} min={0} />
      </div>
      <div className="field col-span-2">
        <label className="label flex items-center gap-2">
          <input type="checkbox" name="bargeIn" defaultChecked={a?.bargeIn ?? true} /> Allow barge-in (caller can interrupt)
        </label>
      </div>

      <div className="field col-span-2 border-t pt-4">
        <label className="label flex items-center gap-2">
          <input type="checkbox" name="allowTransfer" defaultChecked={a?.allowTransfer ?? true} /> Allow transfer to a
          human
        </label>
      </div>
      <div className="field">
        <label className="label">Transfer target type</label>
        <DestSelect name="transferType" value={a?.transferType} />
      </div>
      <div className="field">
        <label className="label">Transfer target id</label>
        <input className="input" name="transferId" defaultValue={a?.transferId ?? ""} placeholder="extension / ring-group id" />
      </div>

      <div className="field col-span-2">
        <label className="label flex items-center gap-2">
          <input type="checkbox" name="allowVoicemail" defaultChecked={a?.allowVoicemail ?? true} /> Allow taking a
          voicemail message
        </label>
      </div>
      <div className="field col-span-2">
        <label className="label">Voicemail extension id (whose mailbox receives messages)</label>
        <input className="input" name="voicemailExtId" defaultValue={a?.voicemailExtId ?? ""} placeholder="extension id" />
      </div>

      <div className="field col-span-2 border-t pt-4">
        <span className="muted text-xs">Fallback if the AI errors, hits max turns, or the caller insists on a human with no transfer set.</span>
      </div>
      <div className="field">
        <label className="label">Fallback type</label>
        <DestSelect name="fallbackType" value={a?.fallbackType} />
      </div>
      <div className="field">
        <label className="label">Fallback id</label>
        <input className="input" name="fallbackId" defaultValue={a?.fallbackId ?? ""} placeholder="extension / ring-group id" />
      </div>

      <div className="col-span-2">
        <button className="btn" type="submit">{a ? "Save changes" : "Create agent"}</button>
      </div>
    </form>
  );
}

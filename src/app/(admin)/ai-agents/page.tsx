import Link from "next/link";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { AgentForm } from "@/features/ai-agents/agent-form";
import { deleteAiAgent, toggleAiAgent } from "@/features/ai-agents/actions";
import { REALTIME_STT_PROVIDER, REALTIME_TTS_PROVIDER } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AiAgentsPage() {
  await requireManager();
  const agents = await db.aiAgent.findMany({ orderBy: { name: "asc" } });

  const live = REALTIME_STT_PROVIDER !== "mock" || REALTIME_TTS_PROVIDER !== "mock";

  return (
    <div>
      <h1 className="text-xl font-semibold mb-2">AI receptionist</h1>
      <p className="muted mb-6 text-sm">
        A real-time voice agent that answers calls, listens, reasons with Claude, and speaks — and can transfer to a
        human, take a message, or answer questions. Route a DID / IVR option / inbound route to an{" "}
        <span className="font-mono">AI_AGENT</span> destination with the agent id below.
      </p>

      <div className={`card mb-6 text-sm ${live ? "" : "opacity-90"}`}>
        <strong>Providers:</strong> STT = <span className="font-mono">{REALTIME_STT_PROVIDER}</span> · TTS ={" "}
        <span className="font-mono">{REALTIME_TTS_PROVIDER}</span>.{" "}
        {live ? (
          <span>Live providers active (per-call cost applies).</span>
        ) : (
          <span className="muted">
            Mock mode (free): the pipeline runs end-to-end but the AI speaks a placeholder tone and uses rule-based
            replies. Set <span className="font-mono">REALTIME_STT_PROVIDER</span>/
            <span className="font-mono">REALTIME_TTS_PROVIDER</span> + keys in <span className="font-mono">.env</span> for
            real speech.
          </span>
        )}
      </div>

      <div className="card mb-8">
        <h2 className="font-medium mb-3">New agent</h2>
        <AgentForm />
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Agent id</th>
              <th>Transfer</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id}>
                <td>
                  <Link className="link" href={`/ai-agents/${a.id}`}>
                    {a.name}
                  </Link>
                </td>
                <td className="font-mono text-xs">{a.id}</td>
                <td>{a.allowTransfer ? (a.transferType ? `${a.transferType}` : "unset") : "no"}</td>
                <td>{a.enabled ? <span className="text-green-600">enabled</span> : <span className="muted">disabled</span>}</td>
                <td className="text-right space-x-2">
                  <form action={toggleAiAgent} className="inline">
                    <input type="hidden" name="id" value={a.id} />
                    <button className="btn-secondary" type="submit">{a.enabled ? "Disable" : "Enable"}</button>
                  </form>
                  <form action={deleteAiAgent} className="inline">
                    <input type="hidden" name="id" value={a.id} />
                    <button className="btn-danger" type="submit">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">No AI agents yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

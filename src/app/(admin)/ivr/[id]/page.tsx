import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { updateFlow, addNode, deleteNode, addOption, deleteOption } from "@/features/ivr/actions";

export const dynamic = "force-dynamic";

const NODE_TYPES = ["MENU", "PLAY", "COLLECT", "TRANSFER", "VOICEMAIL", "DIRECTORY", "HANGUP"] as const;
const DESTINATION_TYPES = ["EXTENSION", "RING_GROUP", "IVR", "VOICEMAIL", "TIME_CONDITION", "HANGUP", "EXTERNAL"] as const;

export default async function IvrFlowBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  const { id } = await params;
  const flow = await db.ivrFlow.findUnique({
    where: { id },
    include: { nodes: { include: { options: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!flow) notFound();

  const nodeName = new Map(flow.nodes.map((n) => [n.id, n.name]));
  const targetLabel = (o: { nextNodeId: string | null; destinationType: string | null; destinationId: string | null }) => {
    if (o.destinationType) return `transfer → ${o.destinationType}${o.destinationId ? `:${o.destinationId}` : ""}`;
    if (o.nextNodeId) return `node → ${nodeName.get(o.nextNodeId) ?? o.nextNodeId}`;
    return "—";
  };

  return (
    <div>
      <div className="mb-6">
        <Link className="text-accent text-sm" href="/ivr">← Back to IVR</Link>
        <h1 className="text-xl font-semibold mt-2">{flow.name}</h1>
      </div>

      {/* Flow settings */}
      <div className="card mb-8">
        <h2 className="font-medium mb-4">Flow settings</h2>
        <form action={updateFlow} className="grid grid-cols-2 gap-4">
          <input type="hidden" name="id" value={flow.id} />
          <div className="field">
            <label className="label">Name</label>
            <input className="input" name="name" defaultValue={flow.name} required />
          </div>
          <div className="field">
            <label className="label">Number</label>
            <input className="input" name="number" defaultValue={flow.number ?? ""} placeholder="optional, unique" />
          </div>
          <div className="field">
            <label className="label">Timeout (seconds)</label>
            <input className="input" name="timeoutSeconds" type="number" min={1} max={120} defaultValue={flow.timeoutSeconds} />
          </div>
          <div className="field">
            <label className="label">Max retries</label>
            <input className="input" name="maxRetries" type="number" min={0} max={10} defaultValue={flow.maxRetries} />
          </div>
          <div className="field">
            <label className="label">Entry node</label>
            <select className="select" name="entryNodeId" defaultValue={flow.entryNodeId ?? ""}>
              <option value="">— first node —</option>
              {flow.nodes.map((n) => (
                <option key={n.id} value={n.id}>{n.name} ({n.type})</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">On invalid / timeout → type</label>
            <select className="select" name="invalidType" defaultValue={flow.invalidType ?? ""}>
              <option value="">— none (hang up) —</option>
              {DESTINATION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="field col-span-2">
            <label className="label">On invalid / timeout → id</label>
            <input className="input" name="invalidId" defaultValue={flow.invalidId ?? ""} placeholder="destination id (optional)" />
          </div>
          <div className="col-span-2">
            <button className="btn" type="submit">Save settings</button>
          </div>
        </form>
      </div>

      {/* Add node */}
      <div className="card mb-8">
        <h2 className="font-medium mb-4">Add node</h2>
        <form action={addNode} className="grid grid-cols-2 gap-4">
          <input type="hidden" name="flowId" value={flow.id} />
          <div className="field">
            <label className="label">Type</label>
            <select className="select" name="type" defaultValue="MENU">
              {NODE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Name</label>
            <input className="input" name="name" placeholder="Main menu" required />
          </div>
          <div className="field col-span-2">
            <label className="label">Prompt text (spoken / played)</label>
            <input className="input" name="promptText" placeholder="Thanks for calling. Press 1 for sales…" />
          </div>
          <div className="field">
            <label className="label">Transfer → type</label>
            <select className="select" name="destinationType" defaultValue="">
              <option value="">— (TRANSFER nodes only) —</option>
              {DESTINATION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Transfer → id</label>
            <input className="input" name="destinationId" placeholder="destination id" />
          </div>
          <div className="col-span-2">
            <button className="btn" type="submit">Add node</button>
          </div>
        </form>
      </div>

      {/* Nodes + their options */}
      <h2 className="font-medium mb-4">Nodes</h2>
      {flow.nodes.length === 0 && (
        <div className="card muted text-sm">No nodes yet — add one above to start building the flow.</div>
      )}

      {flow.nodes.map((node) => (
        <div key={node.id} className="card mb-6">
          <div className="flex items-start justify-between mb-3">
            <div>
              <span className="badge badge-accent mr-2">{node.type}</span>
              <span className="font-medium">{node.name}</span>
              {flow.entryNodeId === node.id && <span className="badge badge-online ml-2">entry</span>}
              {node.promptText && <p className="text-sm muted mt-2">{node.promptText}</p>}
              {node.type === "TRANSFER" && node.destinationType && (
                <p className="text-sm mt-1 font-mono">→ {node.destinationType}{node.destinationId ? `:${node.destinationId}` : ""}</p>
              )}
            </div>
            <form action={deleteNode}>
              <input type="hidden" name="id" value={node.id} />
              <input type="hidden" name="flowId" value={flow.id} />
              <button className="btn-danger" type="submit">Delete node</button>
            </form>
          </div>

          {/* Options for this node */}
          <table className="table mb-3">
            <thead>
              <tr>
                <th>Digit</th>
                <th>Target</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {node.options.map((o) => (
                <tr key={o.id}>
                  <td className="font-mono">{o.digit}</td>
                  <td>{targetLabel(o)}</td>
                  <td className="text-right">
                    <form action={deleteOption}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="flowId" value={flow.id} />
                      <button className="btn-danger" type="submit">Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
              {node.options.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">No options (digits) on this node.</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Add option to this node */}
          <form action={addOption} className="grid grid-cols-2 gap-3">
            <input type="hidden" name="nodeId" value={node.id} />
            <input type="hidden" name="flowId" value={flow.id} />
            <div className="field mb-0">
              <label className="label">Digit</label>
              <input className="input" name="digit" placeholder="1" maxLength={1} required />
            </div>
            <div className="field mb-0">
              <label className="label">Go to node</label>
              <select className="select" name="nextNodeId" defaultValue="">
                <option value="">— none —</option>
                {flow.nodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.name} ({n.type})</option>
                ))}
              </select>
            </div>
            <div className="field mb-0">
              <label className="label">…or transfer → type</label>
              <select className="select" name="destinationType" defaultValue="">
                <option value="">— none —</option>
                {DESTINATION_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="field mb-0">
              <label className="label">…or transfer → id</label>
              <input className="input" name="destinationId" placeholder="destination id" />
            </div>
            <div className="col-span-2">
              <span className="muted text-xs">A transfer destination takes priority over “go to node”. Each digit must be unique per node.</span>
            </div>
            <div className="col-span-2">
              <button className="btn" type="submit">Add option</button>
            </div>
          </form>
        </div>
      ))}
    </div>
  );
}

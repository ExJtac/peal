import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { saveQueue, deleteQueue } from "@/features/queues/actions";

export const dynamic = "force-dynamic";

const DEST_OPTIONS: [string, string][] = [
  ["", "— none —"],
  ["EXTENSION", "Extension"],
  ["RING_GROUP", "Ring group"],
  ["QUEUE", "Queue"],
  ["IVR", "IVR"],
  ["VOICEMAIL", "Voicemail"],
  ["TIME_CONDITION", "Time condition"],
  ["HANGUP", "Hangup"],
  ["AI_AGENT", "AI Receptionist"],
];

function DestPicker({ label, typeName, idName, type, id }: { label: string; typeName: string; idName: string; type: string | null; id: string | null }) {
  return (
    <>
      <div className="field">
        <label className="label">{label} type</label>
        <select className="select" name={typeName} defaultValue={type ?? ""}>
          {DEST_OPTIONS.map(([v, t]) => (
            <option key={v} value={v}>{t}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="label">{label} ID</label>
        <input className="input" name={idName} placeholder="optional" defaultValue={id ?? ""} />
      </div>
    </>
  );
}

export default async function QueuesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireManager();
  const { edit } = await searchParams;
  const queues = await db.queue.findMany({
    orderBy: { number: "asc" },
    include: { members: { orderBy: { order: "asc" }, include: { extension: true } } },
  });
  const editing = edit ? queues.find((q) => q.id === edit) ?? null : null;
  // Members render as "number" or "number:penalty" in ring order.
  const editingMembers = editing
    ? editing.members.map((m) => (m.penalty ? `${m.extension.number}:${m.penalty}` : m.extension.number)).join(", ")
    : "";

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Queues (ACD)</h1>

      <div className={`card mb-8${editing ? " card-editing" : ""}`}>
        <h2 className="font-medium mb-3">{editing ? "Edit queue" : "Add queue"}</h2>
        <form key={editing?.id ?? "new"} action={saveQueue} className="grid grid-cols-2 gap-4">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div className="field">
            <label className="label">Number</label>
            <input className="input" name="number" placeholder="700" defaultValue={editing?.number ?? ""} required />
          </div>
          <div className="field">
            <label className="label">Name</label>
            <input className="input" name="name" placeholder="Support" defaultValue={editing?.name ?? ""} required />
          </div>
          <div className="field">
            <label className="label">Strategy</label>
            <select className="select" name="strategy" defaultValue={editing?.strategy ?? "RINGALL"}>
              <option value="RINGALL">Ring all</option>
              <option value="LINEAR">Linear (in order)</option>
              <option value="FEWEST_CALLS">Fewest calls</option>
              <option value="LEAST_RECENT">Least recent</option>
              <option value="RANDOM">Random</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Music-on-hold class</label>
            <input className="input" name="mohClass" placeholder="default" defaultValue={editing?.mohClass ?? "default"} />
          </div>
          <div className="field">
            <label className="label">Agent ring seconds</label>
            <input className="input" name="agentRingSeconds" type="number" min={5} max={300} defaultValue={editing?.agentRingSeconds ?? 20} />
          </div>
          <div className="field">
            <label className="label">Wrap-up seconds</label>
            <input className="input" name="wrapUpSeconds" type="number" min={0} max={600} defaultValue={editing?.wrapUpSeconds ?? 0} />
          </div>
          <div className="field">
            <label className="label">Max wait seconds (0 = unlimited)</label>
            <input className="input" name="maxWaitSeconds" type="number" min={0} max={7200} defaultValue={editing?.maxWaitSeconds ?? 0} />
          </div>
          <div className="field">
            <label className="label">Announce every (seconds)</label>
            <input className="input" name="announceFrequency" type="number" min={10} max={600} defaultValue={editing?.announceFrequency ?? 30} />
          </div>

          <div className="field col-span-2 flex flex-wrap gap-6">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="joinEmpty" defaultChecked={editing ? editing.joinEmpty : true} />
              <span>Join when no agents</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="leaveWhenEmpty" defaultChecked={editing?.leaveWhenEmpty ?? false} />
              <span>Leave when empty</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="announcePosition" defaultChecked={editing ? editing.announcePosition : true} />
              <span>Announce position</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="announceHoldTime" defaultChecked={editing?.announceHoldTime ?? false} />
              <span>Announce hold time</span>
            </label>
          </div>

          <DestPicker label="Timeout" typeName="timeoutType" idName="timeoutId" type={editing?.timeoutType ?? ""} id={editing?.timeoutId ?? ""} />
          <DestPicker label="Failover" typeName="failoverType" idName="failoverId" type={editing?.failoverType ?? ""} id={editing?.failoverId ?? ""} />

          <div className="field col-span-2">
            <label className="label">Agent extension numbers (comma-separated, optional :penalty)</label>
            <input className="input" name="memberNumbers" placeholder="1001, 1002:1, 1003:2" defaultValue={editingMembers} />
            <span className="muted text-xs">ring order for Linear; lower penalty rings first; unknown numbers are skipped</span>
          </div>

          <div className="col-span-2 flex items-center gap-3">
            <button className="btn" type="submit">{editing ? "Save changes" : "Create queue"}</button>
            {editing && <a className="btn-ghost" href="/queues">Cancel</a>}
          </div>
        </form>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Name</th>
              <th>Strategy</th>
              <th>Agents</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {queues.map((q) => (
              <tr key={q.id} className={editing?.id === q.id ? "row-editing" : undefined}>
                <td className="font-mono">{q.number}</td>
                <td>{q.name}</td>
                <td>{q.strategy}</td>
                <td className="font-mono">
                  {q.members.length ? q.members.map((m) => m.extension.number).join(", ") : <span className="muted">—</span>}
                </td>
                <td className="text-right whitespace-nowrap">
                  <a className="btn-ghost mr-2" href={`/queues?edit=${q.id}`}>Edit</a>
                  <form action={deleteQueue} className="inline">
                    <input type="hidden" name="id" value={q.id} />
                    <button className="btn-danger" type="submit">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
            {queues.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">No queues yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

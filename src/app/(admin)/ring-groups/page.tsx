import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { saveRingGroup, deleteRingGroup } from "@/features/ring-groups/actions";

export const dynamic = "force-dynamic";

export default async function RingGroupsPage() {
  await requireManager();
  const groups = await db.ringGroup.findMany({
    orderBy: { number: "asc" },
    include: { members: { orderBy: { order: "asc" }, include: { extension: true } } },
  });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Ring groups</h1>

      <div className="card mb-8">
        <h2 className="font-medium mb-3">Add ring group</h2>
        <form action={saveRingGroup} className="grid grid-cols-2 gap-4">
          <div className="field">
            <label className="label">Number</label>
            <input className="input" name="number" placeholder="600" required />
          </div>
          <div className="field">
            <label className="label">Name</label>
            <input className="input" name="name" placeholder="Sales" required />
          </div>
          <div className="field">
            <label className="label">Strategy</label>
            <select className="select" name="strategy" defaultValue="RINGALL">
              <option value="RINGALL">Ring all</option>
              <option value="HUNT">Hunt</option>
              <option value="MEMORY_HUNT">Memory hunt</option>
              <option value="RANDOM">Random</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Ring seconds</label>
            <input className="input" name="ringSeconds" type="number" defaultValue={20} min={5} max={300} />
          </div>
          <div className="field">
            <label className="label">Failover type</label>
            <select className="select" name="failoverType" defaultValue="">
              <option value="">— none —</option>
              <option value="EXTENSION">Extension</option>
              <option value="RING_GROUP">Ring group</option>
              <option value="IVR">IVR</option>
              <option value="VOICEMAIL">Voicemail</option>
              <option value="TIME_CONDITION">Time condition</option>
              <option value="HANGUP">Hangup</option>
              <option value="EXTERNAL">External</option>
              <option value="AI_AGENT">AI Receptionist</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Failover ID</label>
            <input className="input" name="failoverId" placeholder="optional" />
          </div>
          <div className="field col-span-2">
            <label className="label">Member extension numbers (comma-separated)</label>
            <input className="input" name="memberNumbers" placeholder="1001, 1002, 1003" />
            <span className="muted text-xs">extension numbers, in ring order; unknown numbers are skipped</span>
          </div>
          <div className="col-span-2">
            <button className="btn" type="submit">Create ring group</button>
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
              <th>Members</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id}>
                <td className="font-mono">{g.number}</td>
                <td>{g.name}</td>
                <td>{g.strategy}</td>
                <td className="font-mono">
                  {g.members.length ? g.members.map((m) => m.extension.number).join(", ") : <span className="muted">—</span>}
                </td>
                <td className="text-right">
                  <form action={deleteRingGroup}>
                    <input type="hidden" name="id" value={g.id} />
                    <button className="btn-danger" type="submit">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">No ring groups yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

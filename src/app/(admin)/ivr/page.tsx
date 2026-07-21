import Link from "next/link";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { saveFlow, deleteFlow } from "@/features/ivr/actions";

export const dynamic = "force-dynamic";

export default async function IvrPage() {
  await requireManager();
  const flows = await db.ivrFlow.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { nodes: true } } },
  });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">IVR / auto-attendant</h1>

      <div className="card mb-8">
        <p className="text-sm muted">
          The call engine interprets these flows live (play prompt → collect a digit → branch) — no dialplan generation.
          Point an inbound route or business-hours destination at an IVR (type IVR, id = the flow id).
        </p>
      </div>

      <div className="card mb-8">
        <h2 className="font-medium mb-3">Add IVR flow</h2>
        <form action={saveFlow} className="grid grid-cols-2 gap-4">
          <div className="field">
            <label className="label">Name</label>
            <input className="input" name="name" placeholder="Main menu" required />
          </div>
          <div className="field">
            <label className="label">Number (optional)</label>
            <input className="input" name="number" placeholder="e.g. 7000 — must be unique" />
          </div>
          <div className="col-span-2">
            <button className="btn" type="submit">Create flow</button>
          </div>
        </form>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Number</th>
              <th>Nodes</th>
              <th>Entry</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {flows.map((f) => (
              <tr key={f.id}>
                <td>
                  <Link className="text-accent" href={`/ivr/${f.id}`}>{f.name}</Link>
                </td>
                <td className="font-mono">{f.number ?? <span className="muted">—</span>}</td>
                <td>{f._count.nodes}</td>
                <td>
                  <span className={`badge ${f.entryNodeId ? "badge-online" : "badge-warn"}`}>
                    {f.entryNodeId ? "entry set" : "no entry"}
                  </span>
                </td>
                <td className="text-right">
                  <form action={deleteFlow}>
                    <input type="hidden" name="id" value={f.id} />
                    <button className="btn-danger" type="submit">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
            {flows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">No IVR flows yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

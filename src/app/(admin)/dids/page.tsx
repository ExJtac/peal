import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { saveDid, deleteDid } from "@/features/dids/actions";

export const dynamic = "force-dynamic";

export default async function DidsPage() {
  await requireManager();
  const [dids, trunks, routes] = await Promise.all([
    db.did.findMany({ orderBy: { e164: "asc" }, include: { trunk: true, inboundRoute: true } }),
    db.trunk.findMany({ orderBy: { name: "asc" } }),
    db.inboundRoute.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">DIDs</h1>

      <div className="card mb-8">
        <h2 className="font-medium mb-3">Add DID</h2>
        <form action={saveDid} className="grid grid-cols-2 gap-4">
          <div className="field">
            <label className="label">E.164 number</label>
            <input className="input" name="e164" placeholder="+12145550123" required />
          </div>
          <div className="field">
            <label className="label">Description</label>
            <input className="input" name="description" placeholder="optional" />
          </div>
          <div className="field">
            <label className="label">Trunk</label>
            <select className="select" name="trunkId" defaultValue="">
              <option value="">— none —</option>
              {trunks.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Inbound route</label>
            <select className="select" name="inboundRouteId" defaultValue="">
              <option value="">— none —</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="field flex items-end gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="emergencyCapable" /> Emergency capable
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="enabled" defaultChecked /> Enabled
            </label>
          </div>
          <div className="col-span-2">
            <button className="btn" type="submit">Create DID</button>
          </div>
        </form>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Description</th>
              <th>Trunk</th>
              <th>Route</th>
              <th>E911</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {dids.map((d) => (
              <tr key={d.id}>
                <td className="font-mono">{d.e164}</td>
                <td>{d.description ?? ""}</td>
                <td>{d.trunk?.name ?? <span className="muted">—</span>}</td>
                <td>{d.inboundRoute?.name ?? <span className="muted">—</span>}</td>
                <td>{d.emergencyCapable ? <span className="badge badge-accent">capable</span> : <span className="muted">—</span>}</td>
                <td>
                  <span className={`badge ${d.enabled ? "badge-online" : "badge-offline"}`}>{d.enabled ? "enabled" : "disabled"}</span>
                </td>
                <td className="text-right">
                  <form action={deleteDid}>
                    <input type="hidden" name="id" value={d.id} />
                    <button className="btn-danger" type="submit">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
            {dids.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">No DIDs yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

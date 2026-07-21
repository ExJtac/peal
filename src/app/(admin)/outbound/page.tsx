import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guards";
import { saveOutboundRoute, deleteOutboundRoute } from "@/features/outbound-routes/actions";

export const dynamic = "force-dynamic";

export default async function OutboundRoutesPage() {
  await requireAdmin();
  const [routes, trunks] = await Promise.all([
    db.outboundRoute.findMany({ orderBy: { priority: "asc" } }),
    db.trunk.findMany({ orderBy: { name: "asc" } }),
  ]);
  // OutboundRoute keeps trunkId as a plain scalar (no Prisma relation), so resolve names here.
  const trunkNameById = new Map(trunks.map((t) => [t.id, t.name]));

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Outbound routes</h1>

      <div className="card mb-8">
        <h2 className="font-medium mb-3">Add outbound route</h2>
        <form action={saveOutboundRoute} className="grid grid-cols-2 gap-4">
          <div className="field">
            <label className="label">Name</label>
            <input className="input" name="name" placeholder="US long distance" required />
          </div>
          <div className="field">
            <label className="label">Priority (lower = first)</label>
            <input className="input" name="priority" type="number" defaultValue={100} />
          </div>
          <div className="field col-span-2">
            <label className="label">Match pattern</label>
            <input className="input" name="matchPattern" placeholder="_1NXXNXXXXXX" required />
            <span className="muted text-xs">Asterisk-style, e.g. <code>_1NXXNXXXXXX</code> (US long distance), <code>_NXXNXXXXXX</code> (10-digit), <code>_011.</code> (international)</span>
          </div>
          <div className="field">
            <label className="label">Strip digits</label>
            <input className="input" name="stripDigits" type="number" defaultValue={0} min={0} />
          </div>
          <div className="field">
            <label className="label">Prepend digits</label>
            <input className="input" name="prependDigits" placeholder="e.g. 1" defaultValue="" />
          </div>
          <div className="field">
            <label className="label">Trunk</label>
            <select className="select" name="trunkId" required defaultValue="">
              <option value="" disabled>Select a trunk…</option>
              {trunks.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Failover trunk</label>
            <select className="select" name="failoverTrunkId" defaultValue="">
              <option value="">— none —</option>
              {trunks.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Caller ID number</label>
            <input className="input" name="callerIdNumber" placeholder="optional" />
          </div>
          <div className="field">
            <label className="label">Permission tag</label>
            <select className="select" name="permissionTag" defaultValue="national">
              <option value="internal">Internal</option>
              <option value="local">Local</option>
              <option value="national">National</option>
              <option value="international">International</option>
            </select>
          </div>
          <div className="field flex items-end gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="requiresPin" /> Requires PIN
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="enabled" defaultChecked /> Enabled
            </label>
          </div>
          <div className="col-span-2">
            <button className="btn" type="submit">Create route</button>
          </div>
        </form>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Priority</th>
              <th>Name</th>
              <th>Match pattern</th>
              <th>Trunk</th>
              <th>Permission</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => (
              <tr key={r.id}>
                <td className="font-mono">{r.priority}</td>
                <td>{r.name}</td>
                <td className="font-mono">{r.matchPattern}</td>
                <td>{trunkNameById.get(r.trunkId) ?? <span className="muted">—</span>}</td>
                <td>{r.permissionTag}</td>
                <td>
                  <span className={`badge ${r.enabled ? "badge-online" : "badge-offline"}`}>{r.enabled ? "enabled" : "disabled"}</span>
                </td>
                <td className="text-right">
                  <form action={deleteOutboundRoute}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="btn-danger" type="submit">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
            {routes.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">No outbound routes yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

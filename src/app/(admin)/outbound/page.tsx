import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { saveOutboundRoute, deleteOutboundRoute } from "@/features/outbound-routes/actions";

export const dynamic = "force-dynamic";

export default async function OutboundRoutesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireManager();
  const { edit } = await searchParams;
  const [routes, trunks] = await Promise.all([
    db.outboundRoute.findMany({ orderBy: { priority: "asc" } }),
    db.trunk.findMany({ orderBy: { name: "asc" } }),
  ]);
  // OutboundRoute keeps trunkId as a plain scalar (no Prisma relation), so resolve names here.
  const trunkNameById = new Map(trunks.map((t) => [t.id, t.name]));
  const editing = edit ? routes.find((r) => r.id === edit) ?? null : null;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Outbound routes</h1>

      <div className={`card mb-8${editing ? " card-editing" : ""}`}>
        <h2 className="font-medium mb-3">{editing ? "Edit outbound route" : "Add outbound route"}</h2>
        {/* key forces the uncontrolled inputs to remount with fresh defaults when switching rows. */}
        <form key={editing?.id ?? "new"} action={saveOutboundRoute} className="grid grid-cols-2 gap-4">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div className="field">
            <label className="label">Name</label>
            <input className="input" name="name" placeholder="US long distance" defaultValue={editing?.name ?? ""} required />
          </div>
          <div className="field">
            <label className="label">Priority (lower = first)</label>
            <input className="input" name="priority" type="number" defaultValue={editing?.priority ?? 100} />
          </div>
          <div className="field col-span-2">
            <label className="label">Match pattern</label>
            <input className="input" name="matchPattern" placeholder="_1NXXNXXXXXX" defaultValue={editing?.matchPattern ?? ""} required />
            <span className="muted text-xs">Asterisk-style, e.g. <code>_1NXXNXXXXXX</code> (US long distance), <code>_NXXNXXXXXX</code> (10-digit), <code>_011.</code> (international)</span>
          </div>
          <div className="field">
            <label className="label">Strip digits</label>
            <input className="input" name="stripDigits" type="number" defaultValue={editing?.stripDigits ?? 0} min={0} />
          </div>
          <div className="field">
            <label className="label">Prepend digits</label>
            <input className="input" name="prependDigits" placeholder="e.g. 1" defaultValue={editing?.prependDigits ?? ""} />
          </div>
          <div className="field">
            <label className="label">Trunk</label>
            <select className="select" name="trunkId" required defaultValue={editing?.trunkId ?? ""}>
              <option value="" disabled>Select a trunk…</option>
              {trunks.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Failover trunk</label>
            <select className="select" name="failoverTrunkId" defaultValue={editing?.failoverTrunkId ?? ""}>
              <option value="">— none —</option>
              {trunks.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Caller ID number</label>
            <input className="input" name="callerIdNumber" placeholder="optional" defaultValue={editing?.callerIdNumber ?? ""} />
          </div>
          <div className="field">
            <label className="label">Permission tag</label>
            <select className="select" name="permissionTag" defaultValue={editing?.permissionTag ?? "national"}>
              <option value="internal">Internal</option>
              <option value="local">Local</option>
              <option value="national">National</option>
              <option value="international">International</option>
            </select>
          </div>
          <div className="field flex items-end gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="requiresPin" defaultChecked={editing?.requiresPin ?? false} /> Requires PIN
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="enabled" defaultChecked={editing ? editing.enabled : true} /> Enabled
            </label>
          </div>
          <div className="col-span-2 flex items-center gap-3">
            <button className="btn" type="submit">{editing ? "Save changes" : "Create route"}</button>
            {editing && <a className="btn-ghost" href="/outbound">Cancel</a>}
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
              <tr key={r.id} className={editing?.id === r.id ? "row-editing" : undefined}>
                <td className="font-mono">{r.priority}</td>
                <td>{r.name}</td>
                <td className="font-mono">{r.matchPattern}</td>
                <td>{trunkNameById.get(r.trunkId) ?? <span className="muted">—</span>}</td>
                <td>{r.permissionTag}</td>
                <td>
                  <span className={`badge ${r.enabled ? "badge-online" : "badge-offline"}`}>{r.enabled ? "enabled" : "disabled"}</span>
                </td>
                <td className="text-right whitespace-nowrap">
                  <a className="btn-ghost mr-2" href={`/outbound?edit=${r.id}`}>Edit</a>
                  <form action={deleteOutboundRoute} className="inline">
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

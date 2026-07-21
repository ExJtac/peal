import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { saveDid, deleteDid } from "@/features/dids/actions";

export const dynamic = "force-dynamic";

export default async function DidsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireManager();
  const { edit } = await searchParams;
  const [dids, trunks, routes] = await Promise.all([
    db.did.findMany({ orderBy: { e164: "asc" }, include: { trunk: true, inboundRoute: true } }),
    db.trunk.findMany({ orderBy: { name: "asc" } }),
    db.inboundRoute.findMany({ orderBy: { name: "asc" } }),
  ]);
  const editing = edit ? dids.find((d) => d.id === edit) ?? null : null;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">DIDs</h1>

      <div className={`card mb-8${editing ? " card-editing" : ""}`}>
        <h2 className="font-medium mb-3">{editing ? "Edit DID" : "Add DID"}</h2>
        {/* key forces the uncontrolled inputs to remount with fresh defaults when switching rows. */}
        <form key={editing?.id ?? "new"} action={saveDid} className="grid grid-cols-2 gap-4">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div className="field">
            <label className="label">E.164 number</label>
            <input className="input" name="e164" placeholder="+12145550123" defaultValue={editing?.e164 ?? ""} required />
          </div>
          <div className="field">
            <label className="label">Description</label>
            <input className="input" name="description" placeholder="optional" defaultValue={editing?.description ?? ""} />
          </div>
          <div className="field">
            <label className="label">Trunk</label>
            <select className="select" name="trunkId" defaultValue={editing?.trunkId ?? ""}>
              <option value="">— none —</option>
              {trunks.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Inbound route</label>
            <select className="select" name="inboundRouteId" defaultValue={editing?.inboundRouteId ?? ""}>
              <option value="">— none —</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="field flex items-end gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="emergencyCapable" defaultChecked={editing ? editing.emergencyCapable : false} /> Emergency capable
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="enabled" defaultChecked={editing ? editing.enabled : true} /> Enabled
            </label>
          </div>
          <div className="col-span-2 flex items-center gap-3">
            <button className="btn" type="submit">{editing ? "Save changes" : "Create DID"}</button>
            {editing && <a className="btn-ghost" href="/dids">Cancel</a>}
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
              <tr key={d.id} className={editing?.id === d.id ? "row-editing" : undefined}>
                <td className="font-mono">{d.e164}</td>
                <td>{d.description ?? ""}</td>
                <td>{d.trunk?.name ?? <span className="muted">—</span>}</td>
                <td>{d.inboundRoute?.name ?? <span className="muted">—</span>}</td>
                <td>{d.emergencyCapable ? <span className="badge badge-accent">capable</span> : <span className="muted">—</span>}</td>
                <td>
                  <span className={`badge ${d.enabled ? "badge-online" : "badge-offline"}`}>{d.enabled ? "enabled" : "disabled"}</span>
                </td>
                <td className="text-right whitespace-nowrap">
                  <a className="btn-ghost mr-2" href={`/dids?edit=${d.id}`}>Edit</a>
                  <form action={deleteDid} className="inline">
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

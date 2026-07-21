import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { saveExtension, deleteExtension } from "@/features/extensions/actions";

export const dynamic = "force-dynamic";

export default async function ExtensionsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireManager();
  const { edit } = await searchParams;
  const exts = await db.extension.findMany({ orderBy: { number: "asc" }, include: { devices: true } });
  const editing = edit ? exts.find((e) => e.id === edit) ?? null : null;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Extensions</h1>

      <div className={`card mb-8${editing ? " card-editing" : ""}`}>
        <h2 className="font-medium mb-3">{editing ? "Edit extension" : "Add extension"}</h2>
        {/* key forces the uncontrolled inputs to remount with fresh defaults when switching rows. */}
        <form key={editing?.id ?? "new"} action={saveExtension} className="grid grid-cols-2 gap-4">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div className="field">
            <label className="label">Number</label>
            {/* number is the ps_* primary key — readOnly (not disabled) in edit mode so it still submits but can't change. */}
            <input className="input" name="number" placeholder="1003" defaultValue={editing?.number ?? ""} readOnly={!!editing} required />
          </div>
          <div className="field">
            <label className="label">Display name</label>
            <input className="input" name="displayName" placeholder="Warehouse" defaultValue={editing?.displayName ?? ""} required />
          </div>
          <div className="field">
            <label className="label">Email (voicemail)</label>
            <input className="input" name="email" type="email" placeholder="optional" defaultValue={editing?.email ?? ""} />
          </div>
          <div className="field">
            <label className="label">Caller ID number</label>
            <input className="input" name="callerIdNumber" placeholder="optional" defaultValue={editing?.callerIdNumber ?? ""} />
          </div>
          <div className="field">
            <label className="label">Outbound permission</label>
            <select className="select" name="outboundPermission" defaultValue={editing?.outboundPermission ?? "national"}>
              <option value="internal">Internal only</option>
              <option value="local">Local</option>
              <option value="national">National</option>
              <option value="international">International</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Ring seconds</label>
            <input className="input" name="ringSeconds" type="number" defaultValue={editing?.ringSeconds ?? 20} min={5} max={120} />
          </div>
          <div className="field col-span-2">
            <label className="label">SIP password ({editing ? "blank = keep existing" : "blank = auto-generate"})</label>
            <input className="input" name="sipPassword" placeholder={editing ? "leave blank to keep existing" : "leave blank to generate"} />
          </div>
          <div className="field col-span-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="webrtc" defaultChecked={editing ? editing.webrtc : false} /> WebRTC (browser softphone endpoint — assign to a portal user for in-browser calling)
            </label>
          </div>
          <div className="col-span-2 flex items-center gap-3">
            <button className="btn" type="submit">{editing ? "Save changes" : "Create extension"}</button>
            {editing && <a className="btn-ghost" href="/extensions">Cancel</a>}
          </div>
        </form>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Ext</th>
              <th>Name</th>
              <th>Permission</th>
              <th>Devices</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {exts.map((e) => (
              <tr key={e.id} className={editing?.id === e.id ? "row-editing" : undefined}>
                <td className="font-mono">{e.number}</td>
                <td>{e.displayName}</td>
                <td>{e.outboundPermission}</td>
                <td>{e.devices.length}</td>
                <td>
                  <span className={`badge ${e.enabled ? "badge-online" : "badge-offline"}`}>{e.enabled ? "enabled" : "disabled"}</span>
                </td>
                <td className="text-right whitespace-nowrap">
                  <a className="btn-ghost mr-2" href={`/extensions?edit=${e.id}`}>Edit</a>
                  <form action={deleteExtension} className="inline">
                    <input type="hidden" name="id" value={e.id} />
                    <button className="btn-danger" type="submit">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
            {exts.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">No extensions yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

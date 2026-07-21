import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guards";
import { saveExtension, deleteExtension } from "@/features/extensions/actions";

export const dynamic = "force-dynamic";

export default async function ExtensionsPage() {
  await requireAdmin();
  const exts = await db.extension.findMany({ orderBy: { number: "asc" }, include: { devices: true } });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Extensions</h1>

      <div className="card mb-8">
        <h2 className="font-medium mb-3">Add extension</h2>
        <form action={saveExtension} className="grid grid-cols-2 gap-4">
          <div className="field">
            <label className="label">Number</label>
            <input className="input" name="number" placeholder="1003" required />
          </div>
          <div className="field">
            <label className="label">Display name</label>
            <input className="input" name="displayName" placeholder="Warehouse" required />
          </div>
          <div className="field">
            <label className="label">Email (voicemail)</label>
            <input className="input" name="email" type="email" placeholder="optional" />
          </div>
          <div className="field">
            <label className="label">Caller ID number</label>
            <input className="input" name="callerIdNumber" placeholder="optional" />
          </div>
          <div className="field">
            <label className="label">Outbound permission</label>
            <select className="select" name="outboundPermission" defaultValue="national">
              <option value="internal">Internal only</option>
              <option value="local">Local</option>
              <option value="national">National</option>
              <option value="international">International</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Ring seconds</label>
            <input className="input" name="ringSeconds" type="number" defaultValue={20} min={5} max={120} />
          </div>
          <div className="field col-span-2">
            <label className="label">SIP password (blank = auto-generate)</label>
            <input className="input" name="sipPassword" placeholder="leave blank to generate" />
          </div>
          <div className="col-span-2">
            <button className="btn" type="submit">Create extension</button>
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
              <tr key={e.id}>
                <td className="font-mono">{e.number}</td>
                <td>{e.displayName}</td>
                <td>{e.outboundPermission}</td>
                <td>{e.devices.length}</td>
                <td>
                  <span className={`badge ${e.enabled ? "badge-online" : "badge-offline"}`}>{e.enabled ? "enabled" : "disabled"}</span>
                </td>
                <td className="text-right">
                  <form action={deleteExtension}>
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

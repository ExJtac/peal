import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guards";
import { saveInboundRoute, deleteInboundRoute } from "@/features/inbound-routes/actions";

export const dynamic = "force-dynamic";

export default async function InboundRoutesPage() {
  await requireAdmin();
  const routes = await db.inboundRoute.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Inbound routes</h1>

      <div className="card mb-8">
        <h2 className="font-medium mb-3">Add inbound route</h2>
        <form action={saveInboundRoute} className="grid grid-cols-2 gap-4">
          <div className="field">
            <label className="label">Name</label>
            <input className="input" name="name" placeholder="Main line" required />
          </div>
          <div className="field">
            <label className="label">Destination type</label>
            <select className="select" name="destinationType" defaultValue="EXTENSION">
              <option value="EXTENSION">Extension</option>
              <option value="RING_GROUP">Ring group</option>
              <option value="IVR">IVR</option>
              <option value="VOICEMAIL">Voicemail</option>
              <option value="TIME_CONDITION">Time condition</option>
              <option value="HANGUP">Hangup</option>
              <option value="EXTERNAL">External</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Destination ID</label>
            <input className="input" name="destinationId" placeholder="optional" />
            <span className="muted text-xs">extension/ring-group/ivr/voicemail-box id</span>
          </div>
          <div className="field">
            <label className="label">Business hours ID</label>
            <input className="input" name="businessHoursId" placeholder="optional" />
          </div>
          <div className="field col-span-2">
            <label className="label">Caller ID name prefix</label>
            <input className="input" name="cidNamePrefix" placeholder="optional, e.g. [Sales]" />
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
              <th>Name</th>
              <th>Destination type</th>
              <th>Destination ID</th>
              <th>CID prefix</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.destinationType}</td>
                <td className="font-mono">{r.destinationId ?? <span className="muted">—</span>}</td>
                <td>{r.cidNamePrefix ?? <span className="muted">—</span>}</td>
                <td className="text-right">
                  <form action={deleteInboundRoute}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="btn-danger" type="submit">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
            {routes.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">No inbound routes yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

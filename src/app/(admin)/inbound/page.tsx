import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { saveInboundRoute, deleteInboundRoute } from "@/features/inbound-routes/actions";

export const dynamic = "force-dynamic";

export default async function InboundRoutesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireManager();
  const { edit } = await searchParams;
  const routes = await db.inboundRoute.findMany({ orderBy: { name: "asc" } });
  const editing = edit ? routes.find((r) => r.id === edit) ?? null : null;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Inbound routes</h1>

      <div className={`card mb-8${editing ? " card-editing" : ""}`}>
        <h2 className="font-medium mb-3">{editing ? "Edit inbound route" : "Add inbound route"}</h2>
        {/* key forces the uncontrolled inputs to remount with fresh defaults when switching rows. */}
        <form key={editing?.id ?? "new"} action={saveInboundRoute} className="grid grid-cols-2 gap-4">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div className="field">
            <label className="label">Name</label>
            <input className="input" name="name" placeholder="Main line" defaultValue={editing?.name ?? ""} required />
          </div>
          <div className="field">
            <label className="label">Destination type</label>
            <select className="select" name="destinationType" defaultValue={editing?.destinationType ?? "EXTENSION"}>
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
            <label className="label">Destination ID</label>
            <input className="input" name="destinationId" placeholder="optional" defaultValue={editing?.destinationId ?? ""} />
            <span className="muted text-xs">extension/ring-group/ivr/voicemail-box id</span>
          </div>
          <div className="field">
            <label className="label">Business hours ID</label>
            <input className="input" name="businessHoursId" placeholder="optional" defaultValue={editing?.businessHoursId ?? ""} />
          </div>
          <div className="field col-span-2">
            <label className="label">Caller ID name prefix</label>
            <input className="input" name="cidNamePrefix" placeholder="optional, e.g. [Sales]" defaultValue={editing?.cidNamePrefix ?? ""} />
          </div>
          <div className="col-span-2 flex items-center gap-3">
            <button className="btn" type="submit">{editing ? "Save changes" : "Create route"}</button>
            {editing && <a className="btn-ghost" href="/inbound">Cancel</a>}
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
              <tr key={r.id} className={editing?.id === r.id ? "row-editing" : undefined}>
                <td>{r.name}</td>
                <td>{r.destinationType}</td>
                <td className="font-mono">{r.destinationId ?? <span className="muted">—</span>}</td>
                <td>{r.cidNamePrefix ?? <span className="muted">—</span>}</td>
                <td className="text-right whitespace-nowrap">
                  <a className="btn-ghost mr-2" href={`/inbound?edit=${r.id}`}>Edit</a>
                  <form action={deleteInboundRoute} className="inline">
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

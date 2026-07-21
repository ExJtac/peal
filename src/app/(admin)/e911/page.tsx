import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { e911IsGoLiveReady } from "@/lib/e911";
import { saveLocation, deleteLocation } from "@/features/e911/actions";

export const dynamic = "force-dynamic";

export default async function E911Page() {
  await requireManager();
  const locations = await db.e911Location.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">E911 locations</h1>

      <p className="muted text-sm mb-6">
        Kari&apos;s Law &amp; RAY BAUM&apos;S Act: a DID can&apos;t be emergency-enabled until its dispatchable location is validated with the carrier.
      </p>

      <div className="card mb-8">
        <h2 className="font-medium mb-3">Add location</h2>
        <form action={saveLocation} className="grid grid-cols-2 gap-4">
          <div className="field">
            <label className="label">Name</label>
            <input className="input" name="name" placeholder="Main office" required />
          </div>
          <div className="field">
            <label className="label">Callback number</label>
            <input className="input" name="callbackNumber" placeholder="+12145551000" required />
          </div>
          <div className="field">
            <label className="label">Street</label>
            <input className="input" name="street" placeholder="123 Main St" required />
          </div>
          <div className="field">
            <label className="label">Suite</label>
            <input className="input" name="suite" placeholder="optional" />
          </div>
          <div className="field">
            <label className="label">City</label>
            <input className="input" name="city" placeholder="Dallas" required />
          </div>
          <div className="field">
            <label className="label">State</label>
            <input className="input" name="state" placeholder="TX" required />
          </div>
          <div className="field">
            <label className="label">Postal code</label>
            <input className="input" name="postal" placeholder="75201" required />
          </div>
          <div className="field">
            <label className="label">Notify emails (comma-separated)</label>
            <input className="input" name="notifyEmails" placeholder="ops@acme.com, security@acme.com" />
          </div>
          <div className="field flex items-center gap-2 col-span-2">
            <input className="size-4" id="validated" name="validated" type="checkbox" />
            <label className="label mb-0" htmlFor="validated">Validated with carrier</label>
          </div>
          <div className="col-span-2">
            <button className="btn" type="submit">Create location</button>
          </div>
        </form>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th>Callback</th>
              <th>Readiness</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {locations.map((loc) => {
              const ready = e911IsGoLiveReady(loc);
              return (
                <tr key={loc.id}>
                  <td>{loc.name}</td>
                  <td className="muted">
                    {loc.street}{loc.suite ? `, ${loc.suite}` : ""}, {loc.city}, {loc.state} {loc.postal}
                  </td>
                  <td className="font-mono">{loc.callbackNumber}</td>
                  <td>
                    <span className={`badge ${ready ? "badge-online" : "badge-warn"}`}>{ready ? "ready" : "incomplete"}</span>
                  </td>
                  <td className="text-right">
                    <form action={deleteLocation}>
                      <input type="hidden" name="id" value={loc.id} />
                      <button className="btn-danger" type="submit">Delete</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {locations.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">No locations yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

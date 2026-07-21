import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { saveDevice, deleteDevice } from "@/features/provisioning/actions";
import { provisioningToken } from "@/provisioning/secrets";
import { appUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function ProvisioningPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireManager();
  const { edit } = await searchParams;
  const [devices, exts] = await Promise.all([
    db.device.findMany({ orderBy: { mac: "asc" }, include: { extension: true } }),
    db.extension.findMany({ orderBy: { number: "asc" } }),
  ]);
  const base = appUrl();
  // MAC is the upsert key — Edit prefills by finding the row via ?edit=<id> and renders MAC read-only
  // so the (still-submitted) MAC upserts the SAME device instead of creating a new one.
  const editing = edit ? devices.find((d) => d.id === edit) ?? null : null;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-2">Phone Provisioning</h1>
      <p className="muted text-sm mb-6">
        Add a phone by MAC, assign an extension, then point the phone at its provisioning URL (or let SIP-PnP push it on the LAN).
        Fanvil-first; the same MAC-keyed URL works for any supported vendor.
      </p>

      <div className={`card mb-8${editing ? " card-editing" : ""}`}>
        <h2 className="font-medium mb-3">{editing ? "Edit device" : "Add device"}</h2>
        {/* key forces the uncontrolled inputs to remount with fresh defaults when switching rows. */}
        <form key={editing?.id ?? "new"} action={saveDevice} className="grid grid-cols-2 gap-4">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div className="field">
            <label className="label">MAC address</label>
            {/* MAC is the upsert key: read-only when editing so the same device is updated (still submits). */}
            <input className="input" name="mac" placeholder="0c:38:3e:11:22:33" defaultValue={editing?.mac ?? ""} readOnly={!!editing} required />
          </div>
          <div className="field">
            <label className="label">Vendor</label>
            <select className="select" name="vendor" defaultValue={editing?.vendor ?? "FANVIL"}>
              <option value="FANVIL">Fanvil</option>
              <option value="YEALINK">Yealink</option>
              <option value="GRANDSTREAM">Grandstream</option>
              <option value="POLY">Poly</option>
              <option value="GENERIC">Generic</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Model</label>
            <input className="input" name="model" placeholder="X4U" defaultValue={editing?.model ?? ""} required />
          </div>
          <div className="field">
            <label className="label">Assign extension</label>
            <select className="select" name="extensionId" defaultValue={editing?.extensionId ?? ""}>
              <option value="">— none —</option>
              {exts.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.number} · {e.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="field col-span-2">
            <label className="label">Timezone (optional)</label>
            <input className="input" name="timezone" placeholder="America/Chicago" defaultValue={editing?.timezone ?? ""} />
          </div>
          <div className="col-span-2 flex items-center gap-3">
            <button className="btn" type="submit">{editing ? "Save changes" : "Add device"}</button>
            {editing && <a className="btn-ghost" href="/provisioning">Cancel</a>}
          </div>
        </form>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>MAC</th>
              <th>Vendor / Model</th>
              <th>Extension</th>
              <th>Provisioning URL</th>
              <th>Last seen</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => {
              const url = `${base}/provision/${d.mac}.cfg?token=${provisioningToken(d.mac)}`;
              return (
                <tr key={d.id} className={editing?.id === d.id ? "row-editing" : undefined}>
                  <td className="font-mono">{d.mac}</td>
                  <td>
                    {d.vendor} <span className="muted">{d.model}</span>
                  </td>
                  <td>{d.extension ? `${d.extension.number}` : <span className="muted">—</span>}</td>
                  <td>
                    <code className="text-xs break-all">{url}</code>
                  </td>
                  <td className="muted text-xs">{d.lastProvisionedAt ? d.lastProvisionedAt.toLocaleString() : "never"}</td>
                  <td className="text-right whitespace-nowrap">
                    <a className="btn-ghost mr-2" href={`/provisioning?edit=${d.id}`}>Edit</a>
                    <form action={deleteDevice} className="inline">
                      <input type="hidden" name="id" value={d.id} />
                      <button className="btn-danger" type="submit">Delete</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {devices.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">No devices yet. Add your Fanvil phones by MAC.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

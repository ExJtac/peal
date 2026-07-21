import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { saveDevice, deleteDevice } from "@/features/provisioning/actions";
import { provisioningToken } from "@/provisioning/secrets";
import { appUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function ProvisioningPage() {
  await requireManager();
  const [devices, exts] = await Promise.all([
    db.device.findMany({ orderBy: { mac: "asc" }, include: { extension: true } }),
    db.extension.findMany({ orderBy: { number: "asc" } }),
  ]);
  const base = appUrl();

  return (
    <div>
      <h1 className="text-xl font-semibold mb-2">Phone Provisioning</h1>
      <p className="muted text-sm mb-6">
        Add a phone by MAC, assign an extension, then point the phone at its provisioning URL (or let SIP-PnP push it on the LAN).
        Fanvil-first; the same MAC-keyed URL works for any supported vendor.
      </p>

      <div className="card mb-8">
        <h2 className="font-medium mb-3">Add device</h2>
        <form action={saveDevice} className="grid grid-cols-2 gap-4">
          <div className="field">
            <label className="label">MAC address</label>
            <input className="input" name="mac" placeholder="0c:38:3e:11:22:33" required />
          </div>
          <div className="field">
            <label className="label">Vendor</label>
            <select className="select" name="vendor" defaultValue="FANVIL">
              <option value="FANVIL">Fanvil</option>
              <option value="YEALINK">Yealink</option>
              <option value="GRANDSTREAM">Grandstream</option>
              <option value="POLY">Poly</option>
              <option value="GENERIC">Generic</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Model</label>
            <input className="input" name="model" placeholder="X4U" required />
          </div>
          <div className="field">
            <label className="label">Assign extension</label>
            <select className="select" name="extensionId" defaultValue="">
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
            <input className="input" name="timezone" placeholder="America/Chicago" />
          </div>
          <div className="col-span-2">
            <button className="btn" type="submit">Add device</button>
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
                <tr key={d.id}>
                  <td className="font-mono">{d.mac}</td>
                  <td>
                    {d.vendor} <span className="muted">{d.model}</span>
                  </td>
                  <td>{d.extension ? `${d.extension.number}` : <span className="muted">—</span>}</td>
                  <td>
                    <code className="text-xs break-all">{url}</code>
                  </td>
                  <td className="muted text-xs">{d.lastProvisionedAt ? d.lastProvisionedAt.toLocaleString() : "never"}</td>
                  <td className="text-right">
                    <form action={deleteDevice}>
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

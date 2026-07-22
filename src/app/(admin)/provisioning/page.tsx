import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { deleteDevice, regenerateWebPassword } from "@/features/provisioning/actions";
import { DeviceControls, RebootAll } from "@/features/provisioning/device-controls";
import { DeviceForm } from "@/features/provisioning/device-form";
import { WebAccess } from "@/features/provisioning/web-access";
import { provisioningToken } from "@/provisioning/secrets";
import { decryptSecret } from "@/lib/crypto-vault";
import { hostFromForwardedFor } from "@/lib/net";
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
        {/* key remounts the form (resetting its client state) when switching between add/edit rows. */}
        <DeviceForm
          key={editing?.id ?? "new"}
          editing={
            editing
              ? {
                  // Only non-secret fields — never the encrypted token columns — cross to the client.
                  id: editing.id,
                  mac: editing.mac,
                  vendor: editing.vendor,
                  model: editing.model,
                  extensionId: editing.extensionId,
                  timezone: editing.timezone,
                }
              : null
          }
          extensions={exts.map((e) => ({ id: e.id, number: e.number, displayName: e.displayName }))}
        />
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">Phones</h2>
          <RebootAll />
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>MAC</th>
              <th>Vendor / Model</th>
              <th>Extension</th>
              <th>Provisioning URL</th>
              <th>Web access</th>
              <th>Last seen</th>
              <th>Controls</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => {
              const url = `${base}/provision/${d.mac}.cfg?token=${provisioningToken(d.mac)}`;
              const host = hostFromForwardedFor(d.lastProvisionedIp);
              let webPw: string | null = null;
              try {
                webPw = d.webAdminPasswordEnc ? decryptSecret(d.webAdminPasswordEnc) : null;
              } catch {
                webPw = null; // stale ciphertext (e.g. CRED_SECRET changed) — show none rather than crash
              }
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
                  <td>
                    <WebAccess user={d.webAdminUser} password={webPw} host={host} />
                    <form action={regenerateWebPassword} className="inline">
                      <input type="hidden" name="id" value={d.id} />
                      <button className="btn-ghost text-xs" type="submit">Regenerate pw</button>
                    </form>
                  </td>
                  <td className="muted text-xs">{d.lastProvisionedAt ? d.lastProvisionedAt.toLocaleString() : "never"}</td>
                  <td>
                    <DeviceControls deviceId={d.id} />
                  </td>
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
                <td colSpan={8} className="muted">No devices yet. Add your Fanvil phones by MAC.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

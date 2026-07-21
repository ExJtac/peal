import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guards";
import { saveTrunk, deleteTrunk } from "@/features/trunks/actions";
import { TELNYX_TEMPLATE } from "@/features/trunks/telnyx-template";

export const dynamic = "force-dynamic";

export default async function TrunksPage() {
  await requireAdmin();
  const trunks = await db.trunk.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Trunks</h1>

      <div className="card mb-8">
        <h2 className="font-medium mb-3">Add trunk</h2>
        <p className="muted text-sm mb-4">
          Telnyx uses IP authentication (no username / password): set Auth mode to IP_AUTH and list the
          provider IPs in Auth IPs. The defaults below are pre-filled from the Telnyx template.
        </p>
        <form action={saveTrunk} className="grid grid-cols-2 gap-4">
          <div className="field">
            <label className="label">Name</label>
            <input className="input" name="name" placeholder="telnyx-primary" required />
          </div>
          <div className="field">
            <label className="label">Provider</label>
            <select className="select" name="provider" defaultValue="TELNYX">
              <option value="TELNYX">Telnyx</option>
              <option value="TWILIO">Twilio</option>
              <option value="BANDWIDTH">Bandwidth</option>
              <option value="VOIPMS">VoIP.ms</option>
              <option value="GENERIC">Generic</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Auth mode</label>
            <select className="select" name="authMode" defaultValue={TELNYX_TEMPLATE.authMode}>
              <option value="IP_AUTH">IP auth</option>
              <option value="REGISTER">Register</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Transport</label>
            <select className="select" name="transport" defaultValue={TELNYX_TEMPLATE.transport}>
              <option value="UDP">UDP</option>
              <option value="TCP">TCP</option>
              <option value="TLS">TLS</option>
            </select>
          </div>
          <div className="field">
            <label className="label">SIP server</label>
            <input className="input" name="sipServer" defaultValue={TELNYX_TEMPLATE.sipServer} required />
          </div>
          <div className="field">
            <label className="label">Port</label>
            <input className="input" name="port" type="number" defaultValue={TELNYX_TEMPLATE.port} min={1} max={65535} />
          </div>
          <div className="field">
            <label className="label">Username (register auth)</label>
            <input className="input" name="username" placeholder="optional" />
          </div>
          <div className="field">
            <label className="label">Password (blank = keep existing)</label>
            <input className="input" name="password" placeholder="optional" />
          </div>
          <div className="field">
            <label className="label">From domain</label>
            <input className="input" name="fromDomain" placeholder="optional" />
          </div>
          <div className="field">
            <label className="label">From user</label>
            <input className="input" name="fromUser" placeholder="optional" />
          </div>
          <div className="field col-span-2">
            <label className="label">Auth IPs (comma-separated, for IP auth)</label>
            <input className="input" name="authIps" defaultValue={TELNYX_TEMPLATE.authIps.join(", ")} placeholder="192.76.120.10, 64.16.250.10" />
          </div>
          <div className="field">
            <label className="label">Outbound proxy</label>
            <input className="input" name="outboundProxy" placeholder="optional" />
          </div>
          <div className="field">
            <label className="label">Codecs (comma-separated)</label>
            <input className="input" name="codecs" defaultValue="ulaw, alaw" />
          </div>
          <div className="field">
            <label className="label">Max channels</label>
            <input className="input" name="maxChannels" type="number" defaultValue={10} min={1} max={999} />
          </div>
          <div className="field flex items-end gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="registerEnabled" /> Register enabled
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="enabled" defaultChecked /> Enabled
            </label>
          </div>
          <div className="col-span-2">
            <button className="btn" type="submit">Create trunk</button>
          </div>
        </form>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Provider</th>
              <th>SIP server</th>
              <th>Auth mode</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {trunks.map((t) => (
              <tr key={t.id}>
                <td className="font-mono">{t.name}</td>
                <td>{t.provider}</td>
                <td>{t.sipServer}</td>
                <td>{t.authMode}</td>
                <td>
                  <span className={`badge ${t.enabled ? "badge-online" : "badge-offline"}`}>{t.enabled ? "enabled" : "disabled"}</span>
                </td>
                <td className="text-right">
                  <form action={deleteTrunk}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="btn-danger" type="submit">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
            {trunks.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">No trunks yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

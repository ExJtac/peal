import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guards";
import { saveGuardrails } from "@/features/guardrails/actions";

export const dynamic = "force-dynamic";

export default async function GuardrailsPage() {
  await requireAdmin();
  const [policy, events] = await Promise.all([
    db.guardrailPolicy.findUnique({ where: { id: "singleton" } }),
    db.blockEvent.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Guardrails</h1>

      <div className="card mb-8">
        <h2 className="font-medium mb-3">Toll-fraud policy</h2>
        <p className="muted text-sm mb-4">International dialing is OFF by default — toll-fraud protection.</p>
        <form action={saveGuardrails} className="grid grid-cols-2 gap-4">
          <div className="field flex items-center gap-2">
            <input className="size-4" id="internationalEnabled" name="internationalEnabled" type="checkbox" defaultChecked={policy?.internationalEnabled ?? false} />
            <label className="label mb-0" htmlFor="internationalEnabled">Allow international dialing</label>
          </div>
          <div className="field">
            <label className="label">Max concurrent outbound</label>
            <input className="input" name="maxConcurrentOutbound" type="number" defaultValue={policy?.maxConcurrentOutbound ?? 4} min={1} max={100} />
          </div>
          <div className="field">
            <label className="label">Allowed country codes (comma-separated)</label>
            <input className="input" name="allowedCountryCodes" defaultValue={(policy?.allowedCountryCodes ?? []).join(", ")} placeholder="1, 44, 52" />
          </div>
          <div className="field">
            <label className="label">Blocked prefixes (comma-separated)</label>
            <input className="input" name="blockedPrefixes" defaultValue={(policy?.blockedPrefixes ?? []).join(", ")} placeholder="1900, 1976, 011882" />
          </div>
          <div className="field col-span-2">
            <label className="label">International PIN (blank = keep current)</label>
            <input className="input" name="internationalPin" placeholder={policy?.internationalPinEnc ? "•••• set — leave blank to keep" : "leave blank for none"} />
          </div>
          <div className="col-span-2">
            <button className="btn" type="submit">Save policy</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="font-medium mb-3">Recent block events</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>To</th>
              <th>Reason</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className="muted">{e.createdAt.toLocaleString()}</td>
                <td className="font-mono">{e.toNumber}</td>
                <td>{e.reason}</td>
                <td>
                  <span className={`badge ${e.action === "ALLOW" ? "badge-online" : e.action === "PIN_REQUIRED" ? "badge-warn" : "badge-offline"}`}>{e.action}</span>
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">No block events yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

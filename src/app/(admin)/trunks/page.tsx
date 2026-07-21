import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { deleteTrunk } from "@/features/trunks/actions";
import { TrunkForm } from "@/features/trunks/trunk-form";

export const dynamic = "force-dynamic";

export default async function TrunksPage() {
  await requireManager();
  const trunks = await db.trunk.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Trunks</h1>

      <div className="card mb-8">
        <h2 className="font-medium mb-3">Add trunk</h2>
        <p className="muted text-sm mb-4">
          Pick your provider to pre-fill its SIP settings, then supply your own credentials. Behind NAT
          (the dev VM), prefer a <strong>Register</strong> trunk — see TRUNK-SETUP.md.
        </p>
        <TrunkForm />
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

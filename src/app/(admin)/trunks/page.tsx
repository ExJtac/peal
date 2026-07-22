import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { deleteTrunk } from "@/features/trunks/actions";
import { TrunkForm, type TrunkInitial } from "@/features/trunks/trunk-form";

export const dynamic = "force-dynamic";

export default async function TrunksPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireManager();
  const { edit } = await searchParams;
  const trunks = await db.trunk.findMany({ orderBy: { name: "asc" } });
  const row = edit ? trunks.find((t) => t.id === edit) ?? null : null;
  // Map the Prisma row → a serializable snapshot for the client form (no Date/Decimal props).
  const editing: TrunkInitial | undefined = row
    ? {
        id: row.id,
        name: row.name,
        provider: row.provider,
        authMode: row.authMode,
        transport: row.transport,
        mediaEncryption: row.mediaEncryption,
        sipServer: row.sipServer,
        port: row.port,
        username: row.username ?? "",
        fromDomain: row.fromDomain ?? "",
        fromUser: row.fromUser ?? "",
        outboundProxy: row.outboundProxy ?? "",
        authIps: row.authIps.join(", "),
        codecs: row.codecs.join(", "),
        registerEnabled: row.registerEnabled,
        maxChannels: row.maxChannels,
        enabled: row.enabled,
      }
    : undefined;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Trunks</h1>

      <div className={`card mb-8${editing ? " card-editing" : ""}`}>
        <h2 className="font-medium mb-3">{editing ? "Edit trunk" : "Add trunk"}</h2>
        <p className="muted text-sm mb-4">
          Pick your provider to pre-fill its SIP settings, then supply your own credentials. Behind NAT
          (the dev VM), prefer a <strong>Register</strong> trunk — see TRUNK-SETUP.md.
        </p>
        {/* key remounts the client form with fresh state when switching between add/edit/rows. */}
        <TrunkForm key={editing?.id ?? "new"} initial={editing} />
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
              <tr key={t.id} className={editing?.id === t.id ? "row-editing" : undefined}>
                <td className="font-mono">{t.name}</td>
                <td>{t.provider}</td>
                <td>{t.sipServer}</td>
                <td>{t.authMode}</td>
                <td>
                  <span className={`badge ${t.enabled ? "badge-online" : "badge-offline"}`}>{t.enabled ? "enabled" : "disabled"}</span>
                </td>
                <td className="text-right whitespace-nowrap">
                  <a className="btn-ghost mr-2" href={`/trunks?edit=${t.id}`}>Edit</a>
                  <form action={deleteTrunk} className="inline">
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

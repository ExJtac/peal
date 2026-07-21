import { requirePortalUser } from "@/lib/guards";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto-vault";
import { SIP_WS_URL, SIP_DOMAIN } from "@/lib/env";
import { Softphone } from "@/features/portal/softphone";
import { setDnd } from "@/features/portal/actions";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const user = await requirePortalUser();
  const ext = user.extensionId ? await db.extension.findUnique({ where: { id: user.extensionId } }) : null;

  if (!ext) {
    return (
      <div className="card">
        <p className="muted">
          No extension is assigned to your account yet. Ask an admin to link one so you can make calls.
        </p>
      </div>
    );
  }

  const password = decryptSecret(ext.sipPasswordEnc);
  const recent = await db.callRecord.findMany({
    where: { OR: [{ fromExtensionId: ext.id }, { toExtensionId: ext.id }] },
    orderBy: { startedAt: "desc" },
    take: 15,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Ext {ext.number}</h1>
          <p className="muted text-sm">{ext.displayName}</p>
        </div>
        <form action={setDnd}>
          <input type="hidden" name="dnd" value={ext.dnd ? "" : "on"} />
          <button className={`btn-ghost ${ext.dnd ? "badge-warn" : ""}`} type="submit">
            {ext.dnd ? "Do Not Disturb: ON" : "Do Not Disturb: off"}
          </button>
        </form>
      </div>

      {!ext.webrtc && (
        <div className="card">
          <span className="badge badge-warn">Not WebRTC-enabled</span>
          <p className="muted text-sm mt-2">
            Browser calling needs a WebRTC extension. Ask an admin to enable it for this extension (or sign in as the
            seeded <code>user@pbx.local</code>, ext 2001).
          </p>
        </div>
      )}

      <Softphone
        wsUrl={SIP_WS_URL}
        sipDomain={SIP_DOMAIN}
        authUser={ext.number}
        password={password}
        displayName={ext.displayName}
        extension={ext.number}
      />

      <div className="card">
        <h2 className="font-medium mb-3">Recent calls</h2>
        {recent.length === 0 ? (
          <p className="muted text-sm">No calls yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Direction</th>
                <th>From</th>
                <th>To</th>
                <th>Sec</th>
                <th>AI summary</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((c) => (
                <tr key={c.id}>
                  <td className="muted">{c.startedAt.toLocaleString()}</td>
                  <td>{c.direction}</td>
                  <td>{c.fromNumber ?? "—"}</td>
                  <td>{c.toNumber ?? "—"}</td>
                  <td>{c.billSec}</td>
                  <td className="muted text-xs">{c.aiSummary ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireUser();
  const [status, extCount, trunkCount, didCount, recent] = await Promise.all([
    db.systemStatus.findUnique({ where: { id: "singleton" } }),
    db.extension.count(),
    db.trunk.count({ where: { enabled: true } }),
    db.did.count(),
    db.callRecord.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
  ]);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="stat">
          <div className="stat-value">
            <span className={`badge ${status?.ariConnected ? "badge-online" : "badge-offline"}`}>
              {status?.ariConnected ? "Connected" : "Offline"}
            </span>
          </div>
          <div className="stat-label mt-2">Call engine (ARI)</div>
        </div>
        <div className="stat">
          <div className="stat-value">{status?.activeChannels ?? 0}</div>
          <div className="stat-label">Active channels</div>
        </div>
        <div className="stat">
          <div className="stat-value">{extCount}</div>
          <div className="stat-label">Extensions</div>
        </div>
        <div className="stat">
          <div className="stat-value">
            {trunkCount} <span className="muted text-sm">trunk{trunkCount === 1 ? "" : "s"}</span> · {didCount} DID
          </div>
          <div className="stat-label">Trunks (enabled) · DIDs</div>
        </div>
      </div>

      <div className="card">
        <h2 className="font-medium mb-3">Recent calls</h2>
        {recent.length === 0 ? (
          <p className="muted text-sm">No calls yet. Register a phone and place a call to see records here.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Direction</th>
                <th>From</th>
                <th>To</th>
                <th>Disposition</th>
                <th>Sec</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((c) => (
                <tr key={c.id}>
                  <td className="muted">{c.startedAt.toLocaleString()}</td>
                  <td>{c.direction}</td>
                  <td>{c.fromNumber ?? "—"}</td>
                  <td>{c.toNumber ?? "—"}</td>
                  <td>{c.disposition ?? "—"}</td>
                  <td>{c.billSec}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

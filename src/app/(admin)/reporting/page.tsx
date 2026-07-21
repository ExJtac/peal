import Link from "next/link";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";

export const dynamic = "force-dynamic";

export default async function ReportingPage() {
  await requireManager();
  const calls = await db.callRecord.findMany({ orderBy: { startedAt: "desc" }, take: 100 });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Reporting</h1>

      <div className="card">
        <h2 className="font-medium mb-3">Recent calls</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Direction</th>
              <th>From</th>
              <th>To</th>
              <th>Disposition</th>
              <th>Sec</th>
              <th>AI summary</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c) => (
              <tr key={c.id}>
                <td className="muted">{c.startedAt.toLocaleString()}</td>
                <td>{c.direction}</td>
                <td className="font-mono">{c.fromNumber ?? "—"}</td>
                <td className="font-mono">{c.toNumber ?? "—"}</td>
                <td>{c.disposition ?? "—"}</td>
                <td>{c.billSec}</td>
                <td className="muted">
                  {c.aiSummary ? `${c.aiSummary.slice(0, 60)}${c.aiSummary.length > 60 ? "…" : ""}` : "—"}
                </td>
                <td className="text-right">
                  <Link className="text-accent" href={`/reporting/${c.id}`}>View</Link>
                </td>
              </tr>
            ))}
            {calls.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">No calls yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

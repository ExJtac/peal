import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { saveBusinessHours, deleteBusinessHours } from "@/features/business-hours/actions";

export const dynamic = "force-dynamic";

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS = [
  { value: "1", label: "Mon" },
  { value: "2", label: "Tue" },
  { value: "3", label: "Wed" },
  { value: "4", label: "Thu" },
  { value: "5", label: "Fri" },
  { value: "6", label: "Sat" },
  { value: "7", label: "Sun" },
];

type Rule = { days?: number[]; start?: string; end?: string };

function summarize(rules: unknown): string {
  const first = Array.isArray(rules) ? (rules[0] as Rule | undefined) : undefined;
  if (!first) return "—";
  const days = (first.days ?? []).map((d) => DAY_NAMES[d] ?? String(d)).join(", ");
  return `${days || "no days"} · ${first.start ?? "?"}–${first.end ?? "?"}`;
}

export default async function BusinessHoursPage() {
  await requireManager();
  const rows = await db.businessHours.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Business hours</h1>

      <div className="card mb-8">
        <h2 className="font-medium mb-3">Add business hours</h2>
        <p className="muted text-sm mb-4">
          {"In-hours goes to the 'in' destination, otherwise the 'else' destination (e.g. an after-hours IVR or voicemail)."}
        </p>
        <form action={saveBusinessHours} className="grid grid-cols-2 gap-4">
          <div className="field">
            <label className="label">Name</label>
            <input className="input" name="name" placeholder="Office hours" required />
          </div>
          <div className="field">
            <label className="label">Timezone</label>
            <input className="input" name="timezone" defaultValue="America/Chicago" required />
          </div>

          <div className="field col-span-2">
            <label className="label">Open days</label>
            <div className="flex flex-wrap gap-4">
              {WEEKDAYS.map((d) => (
                <label key={d.value} className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" name={`day${d.value}`} defaultChecked={Number(d.value) <= 5} /> {d.label}
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="label">Open time</label>
            <input className="input" name="openTime" type="time" defaultValue="09:00" />
          </div>
          <div className="field">
            <label className="label">Close time</label>
            <input className="input" name="closeTime" type="time" defaultValue="17:00" />
          </div>

          <div className="field col-span-2">
            <label className="label">Holidays</label>
            <input className="input" name="holidays" placeholder="comma-separated YYYY-MM-DD, e.g. 2026-12-25, 2027-01-01" />
          </div>

          <div className="field">
            <label className="label">In-hours destination type</label>
            <select className="select" name="inType" defaultValue="EXTENSION">
              <option value="EXTENSION">Extension</option>
              <option value="RING_GROUP">Ring group</option>
              <option value="IVR">IVR</option>
              <option value="VOICEMAIL">Voicemail</option>
              <option value="TIME_CONDITION">Time condition</option>
              <option value="HANGUP">Hangup</option>
              <option value="EXTERNAL">External</option>
            </select>
          </div>
          <div className="field">
            <label className="label">In-hours destination ID</label>
            <input className="input" name="inId" placeholder="destination id" />
          </div>

          <div className="field">
            <label className="label">After-hours destination type</label>
            <select className="select" name="elseType" defaultValue="VOICEMAIL">
              <option value="EXTENSION">Extension</option>
              <option value="RING_GROUP">Ring group</option>
              <option value="IVR">IVR</option>
              <option value="VOICEMAIL">Voicemail</option>
              <option value="TIME_CONDITION">Time condition</option>
              <option value="HANGUP">Hangup</option>
              <option value="EXTERNAL">External</option>
            </select>
          </div>
          <div className="field">
            <label className="label">After-hours destination ID</label>
            <input className="input" name="elseId" placeholder="destination id" />
          </div>

          <div className="col-span-2">
            <button className="btn" type="submit">Create business hours</button>
          </div>
        </form>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Timezone</th>
              <th>Schedule</th>
              <th>In → Else</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td className="font-mono">{r.timezone}</td>
                <td>{summarize(r.rules)}</td>
                <td className="muted text-xs">{r.inType} → {r.elseType}</td>
                <td className="text-right">
                  <form action={deleteBusinessHours}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="btn-danger" type="submit">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">No business hours yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

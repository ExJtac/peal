import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { saveBusinessHours, deleteBusinessHours } from "@/features/business-hours/actions";
import { TIMEZONES, isKnownTimezone } from "@/lib/timezones";

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

export default async function BusinessHoursPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireManager();
  const { edit } = await searchParams;
  const rows = await db.businessHours.findMany({ orderBy: { name: "asc" } });
  const editing = edit ? rows.find((r) => r.id === edit) ?? null : null;
  // Unflatten the stored single rule + holidays back into form defaults.
  const editRule = editing
    ? (editing.rules as unknown as { days: number[]; start: string; end: string }[])[0]
    : null;
  const editHolidays = editing && Array.isArray(editing.holidays) ? (editing.holidays as string[]).join(", ") : "";

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Business hours</h1>

      <div className={`card mb-8${editing ? " card-editing" : ""}`}>
        <h2 className="font-medium mb-3">{editing ? "Edit business hours" : "Add business hours"}</h2>
        <p className="muted text-sm mb-4">
          {"In-hours goes to the 'in' destination, otherwise the 'else' destination (e.g. an after-hours IVR or voicemail)."}
        </p>
        {/* key forces the uncontrolled inputs to remount with fresh defaults when switching rows. */}
        <form key={editing?.id ?? "new"} action={saveBusinessHours} className="grid grid-cols-2 gap-4">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div className="field">
            <label className="label">Name</label>
            <input className="input" name="name" placeholder="Office hours" defaultValue={editing?.name ?? ""} required />
          </div>
          <div className="field">
            <label className="label">Timezone</label>
            <select className="select" name="timezone" defaultValue={editing?.timezone ?? "America/Chicago"} required>
              {/* Preserve a previously-saved custom zone that isn't in the curated list. */}
              {editing?.timezone && !isKnownTimezone(editing.timezone) && (
                <option value={editing.timezone}>{editing.timezone}</option>
              )}
              {TIMEZONES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="field col-span-2">
            <label className="label">Open days</label>
            <div className="flex flex-wrap gap-4">
              {WEEKDAYS.map((d) => (
                <label key={d.value} className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={`day${d.value}`}
                    defaultChecked={editing ? (editRule?.days.includes(Number(d.value)) ?? false) : Number(d.value) <= 5}
                  /> {d.label}
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="label">Open time</label>
            <input className="input" name="openTime" type="time" defaultValue={editRule?.start ?? "09:00"} />
          </div>
          <div className="field">
            <label className="label">Close time</label>
            <input className="input" name="closeTime" type="time" defaultValue={editRule?.end ?? "17:00"} />
          </div>

          <div className="field col-span-2">
            <label className="label">Holidays</label>
            <input className="input" name="holidays" placeholder="comma-separated YYYY-MM-DD, e.g. 2026-12-25, 2027-01-01" defaultValue={editHolidays} />
          </div>

          <div className="field">
            <label className="label">In-hours destination type</label>
            <select className="select" name="inType" defaultValue={editing?.inType ?? "EXTENSION"}>
              <option value="EXTENSION">Extension</option>
              <option value="RING_GROUP">Ring group</option>
              <option value="QUEUE">Queue</option>
              <option value="CONFERENCE">Conference</option>
              <option value="IVR">IVR</option>
              <option value="VOICEMAIL">Voicemail</option>
              <option value="TIME_CONDITION">Time condition</option>
              <option value="HANGUP">Hangup</option>
              <option value="EXTERNAL">External</option>
              <option value="AI_AGENT">AI Receptionist</option>
            </select>
          </div>
          <div className="field">
            <label className="label">In-hours destination ID</label>
            <input className="input" name="inId" placeholder="destination id" defaultValue={editing?.inId ?? ""} />
          </div>

          <div className="field">
            <label className="label">After-hours destination type</label>
            <select className="select" name="elseType" defaultValue={editing?.elseType ?? "VOICEMAIL"}>
              <option value="EXTENSION">Extension</option>
              <option value="RING_GROUP">Ring group</option>
              <option value="QUEUE">Queue</option>
              <option value="CONFERENCE">Conference</option>
              <option value="IVR">IVR</option>
              <option value="VOICEMAIL">Voicemail</option>
              <option value="TIME_CONDITION">Time condition</option>
              <option value="HANGUP">Hangup</option>
              <option value="EXTERNAL">External</option>
              <option value="AI_AGENT">AI Receptionist</option>
            </select>
          </div>
          <div className="field">
            <label className="label">After-hours destination ID</label>
            <input className="input" name="elseId" placeholder="destination id" defaultValue={editing?.elseId ?? ""} />
          </div>

          <div className="col-span-2 flex items-center gap-3">
            <button className="btn" type="submit">{editing ? "Save changes" : "Create business hours"}</button>
            {editing && <a className="btn-ghost" href="/business-hours">Cancel</a>}
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
              <tr key={r.id} className={editing?.id === r.id ? "row-editing" : undefined}>
                <td>{r.name}</td>
                <td className="font-mono">{r.timezone}</td>
                <td>{summarize(r.rules)}</td>
                <td className="muted text-xs">{r.inType} → {r.elseType}</td>
                <td className="text-right whitespace-nowrap">
                  <a className="btn-ghost mr-2" href={`/business-hours?edit=${r.id}`}>Edit</a>
                  <form action={deleteBusinessHours} className="inline">
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

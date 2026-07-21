import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { saveConference, deleteConference } from "@/features/conferences/actions";

export const dynamic = "force-dynamic";

export default async function ConferencesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireManager();
  const { edit } = await searchParams;
  const conferences = await db.conference.findMany({ orderBy: { number: "asc" } });
  const editing = edit ? conferences.find((c) => c.id === edit) ?? null : null;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Conference rooms</h1>

      <div className={`card mb-8${editing ? " card-editing" : ""}`}>
        <h2 className="font-medium mb-3">{editing ? "Edit conference" : "Add conference"}</h2>
        <form key={editing?.id ?? "new"} action={saveConference} className="grid grid-cols-2 gap-4">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div className="field">
            <label className="label">Number</label>
            <input className="input" name="number" placeholder="800" defaultValue={editing?.number ?? ""} required />
          </div>
          <div className="field">
            <label className="label">Name</label>
            <input className="input" name="name" placeholder="All-hands" defaultValue={editing?.name ?? ""} required />
          </div>
          <div className="field">
            <label className="label">Max members</label>
            <input className="input" name="maxMembers" type="number" min={2} max={100} defaultValue={editing?.maxMembers ?? 20} />
          </div>
          <div className="field flex items-end gap-6">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="mohWhenAlone" defaultChecked={editing ? editing.mohWhenAlone : true} />
              <span>Music when alone</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="record" defaultChecked={editing?.record ?? false} />
              <span>Record</span>
            </label>
          </div>
          <div className="col-span-2 flex items-center gap-3">
            <button className="btn" type="submit">{editing ? "Save changes" : "Create conference"}</button>
            {editing && <a className="btn-ghost" href="/conferences">Cancel</a>}
          </div>
        </form>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Name</th>
              <th>Max</th>
              <th>MOH alone</th>
              <th>Record</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {conferences.map((c) => (
              <tr key={c.id} className={editing?.id === c.id ? "row-editing" : undefined}>
                <td className="font-mono">{c.number}</td>
                <td>{c.name}</td>
                <td>{c.maxMembers}</td>
                <td>{c.mohWhenAlone ? "yes" : "no"}</td>
                <td>{c.record ? "yes" : "no"}</td>
                <td className="text-right whitespace-nowrap">
                  <a className="btn-ghost mr-2" href={`/conferences?edit=${c.id}`}>Edit</a>
                  <form action={deleteConference} className="inline">
                    <input type="hidden" name="id" value={c.id} />
                    <button className="btn-danger" type="submit">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
            {conferences.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">No conference rooms yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

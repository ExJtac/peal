import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guards";
import { roleLabel } from "@/lib/roles";
import { saveUser, deleteUser } from "@/features/users/actions";

export const dynamic = "force-dynamic";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const admin = await requireAdmin();
  const { edit } = await searchParams;
  const [users, exts] = await Promise.all([
    db.user.findMany({ orderBy: { email: "asc" }, include: { extension: true } }),
    db.extension.findMany({ orderBy: { number: "asc" } }),
  ]);
  const editing = edit ? users.find((u) => u.id === edit) ?? null : null;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-2">Users</h1>
      <p className="muted text-sm mb-6">
        Admins manage everything, Managers manage telephony config + reports, Users get the calling portal only.
        Link a User to an extension so they can call from the browser.
      </p>

      <div className={`card mb-8${editing ? " card-editing" : ""}`}>
        <h2 className="font-medium mb-3">{editing ? "Edit user" : "Add user"}</h2>
        {/* key forces the uncontrolled inputs to remount with fresh defaults when switching rows. */}
        <form key={editing?.id ?? "new"} action={saveUser} className="grid grid-cols-2 gap-4">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div className="field">
            <label className="label">Email</label>
            <input className="input" name="email" type="email" placeholder="jane@company.com" defaultValue={editing?.email ?? ""} required />
          </div>
          <div className="field">
            <label className="label">Name</label>
            <input className="input" name="name" placeholder="Jane Doe" defaultValue={editing?.name ?? ""} />
          </div>
          <div className="field">
            <label className="label">Role</label>
            <select className="select" name="role" defaultValue={editing?.role ?? "USER"}>
              <option value="ADMIN">Admin</option>
              <option value="MANAGER">Manager</option>
              <option value="USER">User</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Linked extension (for portal calling)</label>
            <select className="select" name="extensionId" defaultValue={editing?.extensionId ?? ""}>
              <option value="">— none —</option>
              {exts.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.number} · {e.displayName}
                  {e.webrtc ? " (WebRTC)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="field col-span-2">
            <label className="label">{editing ? "Password (blank = keep existing)" : "Password (blank = auto-generate)"}</label>
            <input
              className="input"
              name="password"
              placeholder={editing ? "min 8 chars, or leave blank to keep current" : "min 8 chars, or leave blank"}
            />
          </div>
          <div className="col-span-2 flex items-center gap-3">
            <button className="btn" type="submit">{editing ? "Save changes" : "Create user"}</button>
            {editing && <a className="btn-ghost" href="/users">Cancel</a>}
          </div>
        </form>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Role</th>
              <th>Extension</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={editing?.id === u.id ? "row-editing" : undefined}>
                <td>{u.email}</td>
                <td>{u.name ?? <span className="muted">—</span>}</td>
                <td>
                  <span className="badge badge-accent">{roleLabel(u.role)}</span>
                </td>
                <td>{u.extension ? u.extension.number : <span className="muted">—</span>}</td>
                <td className="text-right whitespace-nowrap">
                  <a className="btn-ghost mr-2" href={`/users?edit=${u.id}`}>Edit</a>
                  {u.id !== admin.id ? (
                    <form action={deleteUser} className="inline">
                      <input type="hidden" name="id" value={u.id} />
                      <button className="btn-danger" type="submit">Delete</button>
                    </form>
                  ) : (
                    <span className="muted text-xs">you</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

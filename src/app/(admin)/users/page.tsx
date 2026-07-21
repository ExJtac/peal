import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guards";
import { roleLabel } from "@/lib/roles";
import { saveUser, deleteUser } from "@/features/users/actions";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const admin = await requireAdmin();
  const [users, exts] = await Promise.all([
    db.user.findMany({ orderBy: { email: "asc" }, include: { extension: true } }),
    db.extension.findMany({ orderBy: { number: "asc" } }),
  ]);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-2">Users</h1>
      <p className="muted text-sm mb-6">
        Admins manage everything, Managers manage telephony config + reports, Users get the calling portal only.
        Link a User to an extension so they can call from the browser.
      </p>

      <div className="card mb-8">
        <h2 className="font-medium mb-3">Add user</h2>
        <form action={saveUser} className="grid grid-cols-2 gap-4">
          <div className="field">
            <label className="label">Email</label>
            <input className="input" name="email" type="email" placeholder="jane@company.com" required />
          </div>
          <div className="field">
            <label className="label">Name</label>
            <input className="input" name="name" placeholder="Jane Doe" />
          </div>
          <div className="field">
            <label className="label">Role</label>
            <select className="select" name="role" defaultValue="USER">
              <option value="ADMIN">Admin</option>
              <option value="MANAGER">Manager</option>
              <option value="USER">User</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Linked extension (for portal calling)</label>
            <select className="select" name="extensionId" defaultValue="">
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
            <label className="label">Password (blank = auto-generate)</label>
            <input className="input" name="password" placeholder="min 8 chars, or leave blank" />
          </div>
          <div className="col-span-2">
            <button className="btn" type="submit">Create user</button>
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
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.name ?? <span className="muted">—</span>}</td>
                <td>
                  <span className="badge badge-accent">{roleLabel(u.role)}</span>
                </td>
                <td>{u.extension ? u.extension.number : <span className="muted">—</span>}</td>
                <td className="text-right">
                  {u.id !== admin.id ? (
                    <form action={deleteUser}>
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

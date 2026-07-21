import { requireManager } from "@/lib/guards";
import { Sidebar } from "@/components/sidebar";
import { logoutAction } from "@/features/auth/actions";
import { roleLabel } from "@/lib/roles";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireManager();
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r p-4 flex flex-col" style={{ borderColor: "var(--border)" }}>
        <div className="font-semibold mb-4">☎ PBX Admin</div>
        <Sidebar isAdmin={user.role === "ADMIN"} />
        <div className="mt-auto pt-6">
          <p className="muted text-xs mb-1 truncate">{user.email}</p>
          <p className="muted text-xs mb-2">
            <span className="badge badge-accent">{roleLabel(user.role)}</span>
          </p>
          <form action={logoutAction}>
            <button className="btn-ghost w-full text-sm" type="submit">Log out</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}

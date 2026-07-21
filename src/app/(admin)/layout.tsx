import { requireAdmin } from "@/lib/guards";
import { Sidebar } from "@/components/sidebar";
import { logoutAction } from "@/features/auth/actions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r p-4 flex flex-col" style={{ borderColor: "var(--border)" }}>
        <div className="font-semibold mb-4">☎ PBX Admin</div>
        <Sidebar />
        <div className="mt-auto pt-6">
          <p className="muted text-xs mb-2 truncate">{user.email}</p>
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

import Link from "next/link";
import { requirePortalUser } from "@/lib/guards";
import { logoutAction } from "@/features/auth/actions";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePortalUser();
  const isStaff = user.role === "ADMIN" || user.role === "MANAGER";
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-3" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-5">
          <span className="font-semibold">☎ My Phone</span>
          <nav className="flex gap-2 text-sm">
            <Link href="/portal" className="nav-link">Phone</Link>
            <Link href="/portal/voicemail" className="nav-link">Voicemail</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="muted hidden sm:inline">{user.email}</span>
          {isStaff && <Link href="/" className="btn-ghost">Admin console</Link>}
          <form action={logoutAction}>
            <button className="btn-ghost" type="submit">Log out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-3xl p-6">{children}</main>
    </div>
  );
}

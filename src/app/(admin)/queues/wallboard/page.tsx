import { requireManager } from "@/lib/guards";
import { Wallboard } from "@/features/queues/wallboard";

export const dynamic = "force-dynamic";

export default async function WallboardPage() {
  await requireManager();
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Queue wallboard</h1>
        <a className="btn-ghost" href="/queues">Manage queues</a>
      </div>
      <Wallboard />
    </div>
  );
}

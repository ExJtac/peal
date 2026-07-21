import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { AgentForm } from "@/features/ai-agents/agent-form";

export const dynamic = "force-dynamic";

export default async function EditAiAgentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  const { id } = await params;
  const agent = await db.aiAgent.findUnique({ where: { id } });
  if (!agent) notFound();

  return (
    <div>
      <div className="mb-6">
        <Link className="link text-sm" href="/ai-agents">← AI receptionist</Link>
        <h1 className="text-xl font-semibold mt-1">Edit “{agent.name}”</h1>
      </div>
      <div className="card">
        <AgentForm agent={agent} />
      </div>
    </div>
  );
}

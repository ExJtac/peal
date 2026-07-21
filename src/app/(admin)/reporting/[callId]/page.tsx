import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="field mb-0">
      <div className="label mb-0">{label}</div>
      <div className="text-sm">{value ?? "—"}</div>
    </div>
  );
}

const fmt = (d: Date | null | undefined) => (d ? d.toLocaleString() : "—");

export default async function CallDetailPage({ params }: { params: Promise<{ callId: string }> }) {
  await requireManager();
  const { callId } = await params;
  const call = await db.callRecord.findUnique({ where: { id: callId }, include: { transcript: true } });
  if (!call) notFound();

  const actionItems = Array.isArray(call.aiActionItems) ? (call.aiActionItems as unknown[]) : null;

  return (
    <div>
      <div className="mb-6">
        <Link className="text-accent text-sm" href="/reporting">← Back to reporting</Link>
        <h1 className="text-xl font-semibold mt-2">Call detail</h1>
      </div>

      <div className="card mb-8">
        <h2 className="font-medium mb-4">Call record</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Row label="Direction" value={call.direction} />
          <Row label="Call class" value={call.callClass ?? "—"} />
          <Row label="Disposition" value={call.disposition ?? "—"} />
          <Row label="From" value={<span className="font-mono">{call.fromNumber ?? "—"}</span>} />
          <Row label="To" value={<span className="font-mono">{call.toNumber ?? "—"}</span>} />
          <Row label="Hangup cause" value={call.hangupCause ?? "—"} />
          <Row label="Started" value={fmt(call.startedAt)} />
          <Row label="Answered" value={fmt(call.answeredAt)} />
          <Row label="Ended" value={fmt(call.endedAt)} />
          <Row label="Duration (sec)" value={call.durationSec} />
          <Row label="Billable (sec)" value={call.billSec} />
          <Row label="Unique ID" value={<span className="font-mono">{call.uniqueId ?? "—"}</span>} />
          <Row label="Linked ID" value={<span className="font-mono">{call.linkedId ?? "—"}</span>} />
          <Row
            label="Recording"
            value={
              call.recordingPath ? (
                <audio controls preload="none" src={`/media/recording/${call.id}`} className="w-full max-w-xs" />
              ) : (
                "—"
              )
            }
          />
          <Row
            label="Guardrail"
            value={
              call.guardrailAction ? (
                <span className={`badge ${call.guardrailAction === "ALLOW" ? "badge-online" : call.guardrailAction === "PIN_REQUIRED" ? "badge-warn" : "badge-offline"}`}>{call.guardrailAction}</span>
              ) : (
                "—"
              )
            }
          />
          <Row label="Guardrail reason" value={call.guardrailReason ?? "—"} />
        </div>
      </div>

      <div className="card mb-8">
        <h2 className="font-medium mb-4">AI analysis</h2>
        <div className="field">
          <div className="label">Summary</div>
          <p className="text-sm">{call.aiSummary ?? "No summary."}</p>
        </div>
        <div className="field">
          <div className="label">Sentiment</div>
          <p className="text-sm">{call.aiSentiment ?? "—"}</p>
        </div>
        <div className="field mb-0">
          <div className="label">Action items</div>
          {actionItems && actionItems.length > 0 ? (
            <ul className="list-disc pl-5 text-sm">
              {actionItems.map((item, i) => (
                <li key={i}>{typeof item === "string" ? item : JSON.stringify(item)}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm muted">None.</p>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="font-medium mb-4">Transcript</h2>
        {call.transcript ? (
          <>
            <p className="muted text-xs mb-2">Engine: {call.transcript.engine}</p>
            <p className="text-sm whitespace-pre-wrap">{call.transcript.text}</p>
          </>
        ) : (
          <p className="text-sm muted">No transcript.</p>
        )}
      </div>
    </div>
  );
}

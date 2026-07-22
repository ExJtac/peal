import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { saveSettings } from "@/features/settings/actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireManager();
  const settings = await db.companySettings.findUnique({ where: { id: "singleton" } });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Company settings</h1>

      <div className="card">
        <h2 className="font-medium mb-3">General</h2>
        <form action={saveSettings} className="grid grid-cols-2 gap-4">
          <div className="field">
            <label className="label">Company name</label>
            <input className="input" name="companyName" defaultValue={settings?.companyName ?? "My Company"} required />
          </div>
          <div className="field">
            <label className="label">Timezone</label>
            <input className="input" name="timezone" defaultValue={settings?.timezone ?? "America/Chicago"} required />
          </div>
          <div className="field">
            <label className="label">Default caller ID</label>
            <input className="input" name="defaultCallerId" defaultValue={settings?.defaultCallerId ?? ""} placeholder="optional (E.164)" />
          </div>
          <div className="field">
            <label className="label">SIP domain</label>
            <input className="input" name="sipDomain" defaultValue={settings?.sipDomain ?? "pbx.local"} required />
          </div>
          <div className="field col-span-2">
            <label className="label">External IP</label>
            <input className="input" name="externalIp" defaultValue={settings?.externalIp ?? ""} placeholder="optional (public IP for NAT)" />
          </div>
          <div className="field col-span-2">
            <label className="label">Phone config poll interval (hours)</label>
            <input className="input" type="number" name="provisioningPollHours" min={0} max={168} defaultValue={settings?.provisioningPollHours ?? 24} />
            <p className="muted text-xs mt-1">Phones re-fetch their provisioning config every N hours (0 = off). Reboot a phone to apply immediately.</p>
          </div>
          <div className="field col-span-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="recordCalls" defaultChecked={settings?.recordCalls ?? false} /> Record calls for AI transcription + summaries
            </label>
            <p className="muted text-xs mt-1">
              ⚠ Recording-consent laws vary (one-party vs all-party). Enable only where you have consent; consider a recorded-line announcement.
            </p>
          </div>
          <div className="col-span-2">
            <button className="btn" type="submit">Save settings</button>
          </div>
        </form>
      </div>
    </div>
  );
}

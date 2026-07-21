import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guards";
import { saveSettings } from "@/features/settings/actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();
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
          <div className="col-span-2">
            <button className="btn" type="submit">Save settings</button>
          </div>
        </form>
      </div>
    </div>
  );
}

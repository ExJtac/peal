"use client";

import { useState } from "react";
import { saveTrunk } from "./actions";
import { TRUNK_TEMPLATES, DEFAULT_PROVIDER, templateFor, type TrunkTemplate } from "./provider-templates";

// The template-driven fields (everything a provider template pre-fills). Kept controlled so that
// changing the Provider select re-applies that provider's documented SIP settings live.
function fieldsFrom(t: TrunkTemplate) {
  return {
    authMode: t.authMode,
    transport: t.transport,
    sipServer: t.sipServer,
    port: String(t.port),
    authIps: t.authIps.join(", "),
    codecs: t.codecs,
    registerEnabled: t.registerEnabled,
  };
}

export function TrunkForm() {
  const [provider, setProvider] = useState(DEFAULT_PROVIDER);
  const [f, setF] = useState(() => fieldsFrom(templateFor(DEFAULT_PROVIDER)));
  const t = templateFor(provider);

  function onProvider(p: string) {
    setProvider(p);
    setF(fieldsFrom(templateFor(p)));
  }

  return (
    <form action={saveTrunk} className="grid grid-cols-2 gap-4">
      <div className="field">
        <label className="label">Name</label>
        <input className="input" name="name" placeholder={`${provider.toLowerCase()}-primary`} required />
      </div>
      <div className="field">
        <label className="label">Provider</label>
        <select className="select" name="provider" value={provider} onChange={(e) => onProvider(e.target.value)}>
          {Object.values(TRUNK_TEMPLATES).map((x) => (
            <option key={x.provider} value={x.provider}>
              {x.label}
              {x.natFriendly ? "" : "  (needs public IP)"}
            </option>
          ))}
        </select>
      </div>

      <div className="field col-span-2">
        <p className={`text-sm ${t.natFriendly ? "muted" : "text-amber-600"}`}>{t.hint}</p>
        {!t.natFriendly && (
          <p className="text-sm text-amber-600">
            ⚠️ This provider uses IP authentication, which the double-NAT dev VM can’t receive inbound calls on
            without port-forwarding. For a home test prefer a registration provider (Telnyx / VoIP.ms). See
            TRUNK-SETUP.md.
          </p>
        )}
      </div>

      <div className="field">
        <label className="label">Auth mode</label>
        <select className="select" name="authMode" value={f.authMode} onChange={(e) => setF({ ...f, authMode: e.target.value as TrunkTemplate["authMode"] })}>
          <option value="REGISTER">Register (credentials — NAT-friendly)</option>
          <option value="IP_AUTH">IP auth (needs public IP)</option>
        </select>
      </div>
      <div className="field">
        <label className="label">Transport</label>
        <select className="select" name="transport" value={f.transport} onChange={(e) => setF({ ...f, transport: e.target.value as TrunkTemplate["transport"] })}>
          <option value="UDP">UDP</option>
          <option value="TCP">TCP</option>
          <option value="TLS">TLS</option>
        </select>
      </div>
      <div className="field">
        <label className="label">SIP server</label>
        <input className="input" name="sipServer" value={f.sipServer} onChange={(e) => setF({ ...f, sipServer: e.target.value })} placeholder="sip.example.com" required />
      </div>
      <div className="field">
        <label className="label">Port</label>
        <input className="input" name="port" type="number" value={f.port} onChange={(e) => setF({ ...f, port: e.target.value })} min={1} max={65535} />
      </div>

      <div className="field">
        <label className="label">Username (register auth)</label>
        <input className="input" name="username" placeholder={f.authMode === "REGISTER" ? "required for register" : "optional"} />
      </div>
      <div className="field">
        <label className="label">Password (blank = keep existing)</label>
        <input className="input" name="password" type="password" placeholder={f.authMode === "REGISTER" ? "required for register" : "optional"} />
      </div>

      <div className="field">
        <label className="label">From domain</label>
        <input className="input" name="fromDomain" placeholder="optional" />
      </div>
      <div className="field">
        <label className="label">From user</label>
        <input className="input" name="fromUser" placeholder="optional (caller-ID user)" />
      </div>

      <div className="field col-span-2">
        <label className="label">Auth IPs (comma-separated — for IP auth)</label>
        <input className="input" name="authIps" value={f.authIps} onChange={(e) => setF({ ...f, authIps: e.target.value })} placeholder="e.g. 192.76.120.10, 64.16.250.10" />
      </div>

      <div className="field">
        <label className="label">Outbound proxy</label>
        <input className="input" name="outboundProxy" placeholder="optional" />
      </div>
      <div className="field">
        <label className="label">Codecs (comma-separated)</label>
        <input className="input" name="codecs" value={f.codecs} onChange={(e) => setF({ ...f, codecs: e.target.value })} />
      </div>
      <div className="field">
        <label className="label">Max channels</label>
        <input className="input" name="maxChannels" type="number" defaultValue={10} min={1} max={999} />
      </div>
      <div className="field flex items-end gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="registerEnabled" checked={f.registerEnabled} onChange={(e) => setF({ ...f, registerEnabled: e.target.checked })} /> Register enabled
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" defaultChecked /> Enabled
        </label>
      </div>
      <div className="col-span-2">
        <button className="btn" type="submit">Create trunk</button>
      </div>
    </form>
  );
}

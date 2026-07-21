"use client";

import { useState } from "react";
import { saveTrunk } from "./actions";
import { TRUNK_TEMPLATES, DEFAULT_PROVIDER, templateFor, type TrunkTemplate } from "./provider-templates";

// A serializable snapshot of a trunk to edit (the page maps the Prisma row → this plain shape,
// since client components can't receive Date/Decimal props).
export interface TrunkInitial {
  id: string;
  name: string;
  provider: string;
  authMode: TrunkTemplate["authMode"];
  transport: TrunkTemplate["transport"];
  sipServer: string;
  port: number;
  username: string;
  fromDomain: string;
  fromUser: string;
  outboundProxy: string;
  authIps: string; // comma-joined
  codecs: string; // comma-joined
  registerEnabled: boolean;
  maxChannels: number;
  enabled: boolean;
}

// The template-driven fields (everything a provider template pre-fills). Kept controlled so that
// changing the Provider select re-applies that provider's documented SIP settings live.
function fieldsFromTemplate(t: TrunkTemplate) {
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

// When editing, seed those same fields from the trunk's ACTUAL stored values (not the template).
function fieldsFromInitial(i: TrunkInitial) {
  return {
    authMode: i.authMode,
    transport: i.transport,
    sipServer: i.sipServer,
    port: String(i.port),
    authIps: i.authIps,
    codecs: i.codecs,
    registerEnabled: i.registerEnabled,
  };
}

export function TrunkForm({ initial }: { initial?: TrunkInitial }) {
  const editing = !!initial;
  const [provider, setProvider] = useState(initial?.provider ?? DEFAULT_PROVIDER);
  const [f, setF] = useState(() => (initial ? fieldsFromInitial(initial) : fieldsFromTemplate(templateFor(DEFAULT_PROVIDER))));
  const t = templateFor(provider);

  // Switching provider re-applies that provider's documented settings (even mid-edit — the user
  // deliberately changed provider). Stored per-trunk credentials (username/password) are untouched.
  function onProvider(p: string) {
    setProvider(p);
    setF(fieldsFromTemplate(templateFor(p)));
  }

  return (
    <form action={saveTrunk} className="grid grid-cols-2 gap-4">
      {editing && <input type="hidden" name="id" value={initial!.id} />}
      <div className="field">
        <label className="label">Name</label>
        {/* name is the ps_* identity — renaming would orphan the Asterisk rows, so it's locked in edit mode. */}
        <input className="input" name="name" defaultValue={initial?.name ?? ""} placeholder={`${provider.toLowerCase()}-primary`} readOnly={editing} required />
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
        <input className="input" name="username" defaultValue={initial?.username ?? ""} placeholder={f.authMode === "REGISTER" ? "required for register" : "optional"} />
      </div>
      <div className="field">
        <label className="label">Password {editing ? "(blank = keep existing)" : ""}</label>
        <input className="input" name="password" type="password" placeholder={editing ? "leave blank to keep current" : f.authMode === "REGISTER" ? "required for register" : "optional"} />
      </div>

      <div className="field">
        <label className="label">From domain</label>
        <input className="input" name="fromDomain" defaultValue={initial?.fromDomain ?? ""} placeholder="optional" />
      </div>
      <div className="field">
        <label className="label">From user</label>
        <input className="input" name="fromUser" defaultValue={initial?.fromUser ?? ""} placeholder="optional (caller-ID user)" />
      </div>

      <div className="field col-span-2">
        <label className="label">Auth IPs (comma-separated — for IP auth)</label>
        <input className="input" name="authIps" value={f.authIps} onChange={(e) => setF({ ...f, authIps: e.target.value })} placeholder="e.g. 192.76.120.10, 64.16.250.10" />
      </div>

      <div className="field">
        <label className="label">Outbound proxy</label>
        <input className="input" name="outboundProxy" defaultValue={initial?.outboundProxy ?? ""} placeholder="optional" />
      </div>
      <div className="field">
        <label className="label">Codecs (comma-separated)</label>
        <input className="input" name="codecs" value={f.codecs} onChange={(e) => setF({ ...f, codecs: e.target.value })} />
      </div>
      <div className="field">
        <label className="label">Max channels</label>
        <input className="input" name="maxChannels" type="number" defaultValue={initial?.maxChannels ?? 10} min={1} max={999} />
      </div>
      <div className="field flex items-end gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="registerEnabled" checked={f.registerEnabled} onChange={(e) => setF({ ...f, registerEnabled: e.target.checked })} /> Register enabled
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" defaultChecked={initial ? initial.enabled : true} /> Enabled
        </label>
      </div>
      <div className="col-span-2 flex items-center gap-3">
        <button className="btn" type="submit">{editing ? "Save changes" : "Create trunk"}</button>
        {editing && <a className="btn-ghost" href="/trunks">Cancel</a>}
      </div>
    </form>
  );
}

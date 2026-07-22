"use client";

import { useState } from "react";
import { saveDevice } from "./actions";
import { modelsForVendor } from "@/provisioning/models";
import { TIMEZONES, isKnownTimezone } from "@/lib/timezones";

// Add/Edit device form for /provisioning. Client component so the Model dropdown can CASCADE off
// the selected Vendor, with an "Other…" escape hatch that reveals a free-text box (Device.model is
// free-form under the hood, so any unlisted model still saves). Submits to the `saveDevice` server
// action unchanged. Only non-secret fields are passed in — never the encrypted token columns.

const OTHER = "__other__";

const VENDORS = [
  { value: "FANVIL", label: "Fanvil" },
  { value: "YEALINK", label: "Yealink" },
  { value: "GRANDSTREAM", label: "Grandstream" },
  { value: "POLY", label: "Poly" },
  { value: "GENERIC", label: "Generic" },
];

export interface EditingDevice {
  id: string;
  mac: string;
  vendor: string;
  model: string;
  extensionId: string | null;
  timezone: string | null;
}

export function DeviceForm({
  editing,
  extensions,
}: {
  editing: EditingDevice | null;
  extensions: { id: string; number: string; displayName: string }[];
}) {
  const [vendor, setVendor] = useState(editing?.vendor ?? "FANVIL");
  // On edit, if the stored model isn't in the vendor's curated list, start in "Other…" mode.
  const initialModels = modelsForVendor(editing?.vendor ?? "FANVIL");
  const initialIsKnown = !!editing?.model && initialModels.includes(editing.model);
  const [modelChoice, setModelChoice] = useState(
    editing?.model ? (initialIsKnown ? editing.model : OTHER) : (initialModels[0] ?? OTHER),
  );
  const [customModel, setCustomModel] = useState(initialIsKnown ? "" : editing?.model ?? "");

  const models = modelsForVendor(vendor);
  const isOther = modelChoice === OTHER;

  function onVendorChange(next: string) {
    setVendor(next);
    // Reset the model to the new vendor's first model (or Other… if the vendor has none, e.g. Generic).
    const list = modelsForVendor(next);
    setModelChoice(list[0] ?? OTHER);
  }

  return (
    <form key={editing?.id ?? "new"} action={saveDevice} className="grid grid-cols-2 gap-4">
      {editing && <input type="hidden" name="id" value={editing.id} />}
      <div className="field">
        <label className="label">MAC address</label>
        {/* MAC is the upsert key: read-only when editing so the same device is updated (still submits). */}
        <input className="input" name="mac" placeholder="0c:38:3e:11:22:33" defaultValue={editing?.mac ?? ""} readOnly={!!editing} required />
      </div>
      <div className="field">
        <label className="label">Vendor</label>
        <select className="select" name="vendor" value={vendor} onChange={(e) => onVendorChange(e.target.value)}>
          {VENDORS.map((v) => (
            <option key={v.value} value={v.value}>{v.label}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="label">Model</label>
        {/* Unnamed picker (not submitted) drives the state; the actual `model` value is mirrored below. */}
        <select className="select" value={modelChoice} onChange={(e) => setModelChoice(e.target.value)}>
          {models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
          <option value={OTHER}>Other…</option>
        </select>
        {isOther ? (
          <input
            className="input mt-2"
            name="model"
            placeholder="Enter model, e.g. X4U"
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            required
          />
        ) : (
          <input type="hidden" name="model" value={modelChoice} />
        )}
      </div>
      <div className="field">
        <label className="label">Assign extension</label>
        <select className="select" name="extensionId" defaultValue={editing?.extensionId ?? ""}>
          <option value="">— none —</option>
          {extensions.map((e) => (
            <option key={e.id} value={e.id}>
              {e.number} · {e.displayName}
            </option>
          ))}
        </select>
      </div>
      <div className="field col-span-2">
        <label className="label">Timezone (optional)</label>
        <select className="select" name="timezone" defaultValue={editing?.timezone ?? ""}>
          <option value="">Use company default</option>
          {/* Preserve a previously-saved custom zone that isn't in the curated list. */}
          {editing?.timezone && !isKnownTimezone(editing.timezone) && (
            <option value={editing.timezone}>{editing.timezone}</option>
          )}
          {TIMEZONES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div className="col-span-2 flex items-center gap-3">
        <button className="btn" type="submit">{editing ? "Save changes" : "Add device"}</button>
        {editing && <a className="btn-ghost" href="/provisioning">Cancel</a>}
      </div>
    </form>
  );
}

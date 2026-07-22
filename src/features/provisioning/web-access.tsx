"use client";

import { useState } from "react";

// Shows how to reach a phone's own web UI: a clickable http://<lan-ip> link (captured on the
// phone's last config fetch) + the web-admin login the system pushed into the config, with a
// reveal toggle. The password is already decrypted server-side and passed as a prop.
export function WebAccess({ user, password, host }: { user: string; password: string | null; host: string | null }) {
  const [show, setShow] = useState(false);

  return (
    <div className="text-xs space-y-1">
      {host ? (
        <a className="text-blue-600 underline break-all" href={`http://${host}`} target="_blank" rel="noreferrer">
          http://{host} ↗
        </a>
      ) : (
        <span className="muted">IP unknown (provision once)</span>
      )}
      {password ? (
        <div className="font-mono">
          {user} / {show ? password : "••••••••"}{" "}
          <button type="button" className="btn-ghost" onClick={() => setShow((s) => !s)}>
            {show ? "hide" : "show"}
          </button>
        </div>
      ) : (
        <span className="muted">no web password</span>
      )}
    </div>
  );
}

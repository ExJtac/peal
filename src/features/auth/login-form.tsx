"use client";

import { useActionState } from "react";
import { loginAction, type AuthState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(loginAction, {});
  return (
    <form action={action} className="card w-full max-w-sm">
      <h1 className="text-lg font-semibold mb-1">☎ PBX Admin</h1>
      <p className="muted text-sm mb-4">Sign in to manage your phone system.</p>
      <div className="field">
        <label className="label">Email</label>
        <input className="input" name="email" type="email" defaultValue="admin@pbx.local" autoComplete="username" />
      </div>
      <div className="field">
        <label className="label">Password</label>
        <input className="input" name="password" type="password" autoComplete="current-password" />
      </div>
      {state.error && <p className="error mb-3 text-sm">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

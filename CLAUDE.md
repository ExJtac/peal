@AGENTS.md

# pbx — project notes

A **custom AI-native PBX** (phone system) to replace 3CX for a single small business
(≤25 phones). Uses **Asterisk 22 LTS** as the invisible SIP/media engine and puts our
**own full control plane, admin UI, phone provisioning, and AI** on top of it via **ARI**
(Asterisk REST Interface). Bring-your-own SIP trunk (Telnyx first), auto-provisions any
IP phone (Fanvil-first), runs on a local Debian VM.

> ✅ **STATUS: built + green + LIVE.** Admin console + user portal, in-browser WebRTC calling,
> call recording→AI summaries, and the **real-time AI receptionist** (live externalMedia voice
> agent) are all built and verified running in the VM (`npm run build` + 89 tests; `npm run smoke:ai`).
> **Resume from `NEXT-STEPS.md`** (source of truth); navigation in `CODEMAP.md`. Next up: Telnyx
> trunk → real PSTN (needs the user's SIP creds), then call-center (queues/ACD), then hardening.

> ⚠️ Will be built on **Next.js 16** + **Prisma 7** (breaking changes vs older docs — see
> `@AGENTS.md`). Gotchas to carry over from the sibling projects:
> - `params`/`searchParams`/`cookies()` are **async** — await them.
> - Prisma 7 has **no schema `url`** — connection lives in `prisma.config.ts` (CLI) + the pg
>   driver adapter in `src/lib/db.ts` (runtime). Run `prisma generate` after install **and**
>   after every `prisma migrate dev`.
> - **Two schema owners in one Postgres DB:** our tables in schema `public` (Prisma), and
>   Asterisk's `ps_*`/`cdr`/`cel` in schema `asterisk` (raw SQL, ODBC-read). `prisma migrate`
>   must **never** touch `asterisk`.
> - **Run exactly one** `npm run ari` and one `npm run worker` — tsx restart orphans node
>   children that race for jobs/events (`pkill -f` before restarting).
> - **911 is native-first in the dialplan — never routed through our Stasis app.** Emergency
>   calling must never depend on the control plane being up.

## Architecture (thin telephony engine + fat control plane)
- **Asterisk 22 LTS** (PJSIP-only, compiled from source, pinned ≥22.8.0) = the call engine.
  The dialplan is trivial: every call → `Stasis(pbx-app,…)`. All routing/IVR/queue/AI logic
  lives in our Node/TS code, driven over **ARI** (REST `:8088` + JSON WebSocket; prefer
  **outbound WebSockets** so Asterisk dials out to us and nothing inbound is exposed).
- **PostgreSQL, one DB, two owners:** `public.*` (our app, Prisma) + `asterisk.*`
  (`ps_endpoints/ps_auths/ps_aors/ps_endpoint_id_ips/ps_registrations`, `cdr`, `cel` — raw
  SQL, read live by Asterisk via ARA + Sorcery over ODBC). "Provision an extension" = a DB
  write, no file edits. Transports + globals stay in `pjsip.conf` (never realtime).
- **Three long-running Node processes:** `worker/ari` (call-control daemon), `worker/jobs`
  (async-AI job worker, reuses the DB-backed queue), `worker/pnp` (SIP-PnP provisioning
  responder). The Next.js admin app enqueues + reads.

## Stack (matches the house stack — see `../video-to-story`, `../seller-app`)
- **Engine:** Asterisk 22.x LTS, PJSIP, from source (script the build so **dev == prod**).
- **Control plane / admin:** **Next.js 16** (App Router, Server Actions, TypeScript) +
  **Tailwind v4**; thin ARI wrapper over REST + `ws` (own it — node-ari-client is best-effort).
- **DB:** **PostgreSQL** (local superuser `james`) via **Prisma 7** (`@prisma/adapter-pg`).
- **Auth:** self-hosted, JWT cookie (`jose` + `bcryptjs`); seeded admin only (single-tenant).
- **AI (async first):** STT (Deepgram / local Whisper) → **Claude** summary
  (`@anthropic-ai/sdk`), behind a provider seam with an **offline mock default** (no keys →
  mock, so `npm test` spends nothing). Haiku 4.5 default; Sonnet 5 / Opus 4.8 for heavier work.
- **SIP trunk:** bring-your-own; **Telnyx** template first (also fits Twilio/Bandwidth/VoIP.ms).
- **Phones:** Fanvil-first auto-provisioning; any vendor via per-vendor renderers.

## Dev loop (Mac + Lima VM — no Docker)
Dev runs the Node control plane **natively on the Mac** pointing at **Asterisk in a Lima
bridged Debian 13 VM** (bridged = the VM gets a real LAN IP, so a real Fanvil + softphones
register with zero NAT pain). The same scripted Asterisk build promotes straight to the prod
Debian VM. Full bootstrap is in `BUILD-PLAN.md` → "Dev environment bootstrap".

```bash
# once scaffolded (Phase 0+):
brew install lima socket_vmnet
limactl start asterisk/lima/pbx.yaml     # Debian 13 + Asterisk 22 from source (bridged)
createdb pbx                             # local Postgres superuser "james"
npm install && npm run db:deploy && npm run db:seed
# terminal A: npm run ari      (call-control daemon — exactly one)
# terminal B: npm run worker   (async-AI jobs — exactly one)
# terminal C: npm run dev      (admin UI, http://localhost:3000)
# terminal D (zero-touch prov test): npm run pnp
```

## Test it
- `npm run build` = typecheck gate.
- `npm test` (vitest) = **offline** hermetic suite (mock providers via `test/setup.ts`) —
  guardrail engine, dial-pattern matcher, IVR interpreter (mock ARI), `psWriter` SQL builders,
  Fanvil renderer golden output, business-hours, queue claim/heartbeat.
- `npm run smoke:live` = **opt-in**, real credits/engine: one real ARI originate+hangup, one
  Telnyx test call, one Deepgram + one Claude summary.
- **Verify end-to-end** by driving the real flow: softphone/Fanvil registration, a call into
  Stasis, kill-daemon-mid-call recovery (Phase 0), PSTN via a Telnyx test DID (Phase 1).

## Conventions (inherited from the workspace)
- **Feature-isolated files.** Each feature under `src/features/<feature>/` (actions + its
  client components + css). Shared infra `src/lib/`; call-control engine `src/telephony/`;
  provisioning `src/provisioning/`; async AI `src/ai/`; routes `src/app/`.
- **Worker-safe modules.** `src/lib/*`, `src/telephony/*`, `src/provisioning/*`, `src/ai/*`
  are plain Node — **no `import "server-only"`** — so the daemons can import them. Only
  Next-only code (`auth.ts`, `guards.ts`, Server Actions, components) uses `server-only`.
- **Swappable provider seams with offline mocks** (`src/ai/providers/*`, the ARI/engine seam).
- **`CODEMAP.md` is the source of truth for navigation** — update it in the same step as any
  feature/module added, moved, or removed.
- **Local keys stay in gitignored `.env`.** Local-only app; no key rotation until shared
  externally.

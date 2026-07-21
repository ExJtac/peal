# Custom AI-PBX — Build Plan

> Approved 2026-07-20. This is the source-of-truth plan for the `pbx` project. Navigation is
> in `CODEMAP.md`; resume checklist in `NEXT-STEPS.md`; conventions in `CLAUDE.md`.

## Context

We're replacing **3CX** (unreliable + costing money) with our **own** phone system for a
single small business (≤25 phones). The goal: a PBX that does everything 3CX does, is easier
to use, connects a **bring-your-own SIP trunk**, auto-provisions **any IP phone**
(Fanvil-first), and is **AI-native** — all running locally on a **Debian VM**, developed on
this Mac.

**Key architectural decision:** do *not* hand-write a SIP/RTP/codec stack (a multi-year
detour). Instead use **Asterisk 22 LTS** as an invisible, battle-tested call engine and build
**our own full control plane, admin UI, provisioning, and AI on top of it** via **ARI**
(Asterisk REST Interface). This is the "own the brain, rent the reliable plumbing" pattern —
FreePBX is the dated PHP version of this idea; we build a clean, data-driven, AI-native one
that is genuinely ours.

**Decisions locked with the user:**
- **Full custom control plane** — every call routes into `Stasis(pbx-app)` and all
  routing/IVR/queue logic lives in our Node/TS code (built with resilience so a code restart
  never kills dial-tone).
- **Async AI first** — voicemail transcription + summaries and after-call
  summaries/action-items/sentiment (Claude). The real-time conversational voice agent is a
  later phase (seam designed now, not built in MVP).
- **Telnyx** recommended as the first trunk template, behind a generic bring-your-own trunk
  model (also fits Twilio/Bandwidth/VoIP.ms).
- **Single-tenant, ≤25 phones, low concurrency** — no multi-tenant, no SBC early.

**Project folder:** `/Users/jamesai/Desktop/claude/pbx/`.

---

## Architecture (thin telephony layer + fat control plane)

```
ADMIN UI (React / Next.js)  ──HTTPS/WSS──►  CONTROL PLANE (Node/TS)
  extensions·trunks·DIDs·IVR·                • ARI call-control daemon  (worker/ari)
  routing·voicemail·provisioning·            • async-AI job worker      (worker/jobs)
  guardrails·E911·reporting                  • SIP-PnP responder        (worker/pnp)
                                             • Next.js admin app + Server Actions
        │ ARI REST :8088 + outbound WS        │ Prisma (public)   │ raw pg (asterisk schema)
        ▼                                     ▼                   ▼
   ASTERISK 22 LTS (PJSIP, from source)   PostgreSQL (one DB, TWO owners)
   dialplan = trivial Stasis() hand-off   • public.* = our app (Prisma)
        │ SIP/SRTP        │ prov (HTTPS/PnP) • asterisk.* = ps_*/cdr/cel (raw SQL, ODBC-read)
        ▼                 ▼
   TELNYX TRUNK (BYO)   FANVIL / IP PHONES
```

**How layers connect:**
- **Engine → control plane:** ARI. REST at `:8088/ari` for imperative control
  (answer/bridge/originate/playback/snoop/record); a JSON WebSocket streams channel events.
  Use **ARI Outbound WebSockets** (Asterisk 22 dials *out* to our daemon) so nothing inbound
  is exposed. The dialplan stays trivial: every call → `Stasis(pbx-app,…)`.
- **Control plane → DB:** one Postgres, two schemas. Our tables via **Prisma** (`public`);
  Asterisk reads `ps_endpoints/ps_auths/ps_aors/ps_endpoint_id_ips/ps_registrations` live via
  the **Asterisk Realtime Architecture (ARA) + Sorcery over ODBC** from schema `asterisk`.
  "Provision an extension" = a DB write, no file edits. **Gotcha:** `type=transport` + globals
  stay in `pjsip.conf` (never realtime); `ps_contacts` is Asterisk-managed (we never write it).
- **CDR/CEL:** native `cdr_pgsql` + `cel_pgsql` write to Postgres; we overlay a `CallRecord`
  from ARI events for reporting.

---

## Tech stack (matches the house stack — see `../seller-app`, `../video-to-story`)

| Layer | Choice | Reuse / notes |
|---|---|---|
| Engine | **Asterisk 22.x LTS**, PJSIP-only, **compiled from source** (pin ≥22.8.0) | Debian ships old v20 — don't `apt install`. Script the build so **dev == prod**. |
| Control plane | **Node/TypeScript**, thin ARI wrapper over REST + `ws` | node-ari-client is "best-effort" — own a pinned wrapper (`src/telephony/ariClient.ts`). |
| Admin app | **Next.js 16** (App Router + Server Actions) + **Tailwind v4** | Mirror `seller-app` feature-isolated `src/features/<feature>/`. |
| DB / ORM | **PostgreSQL** (local superuser `james`) + **Prisma 7** (`@prisma/adapter-pg`) | Clone `src/lib/db.ts` + `prisma.config.ts` from `video-to-story`; **worker-safe** (no `server-only`). |
| Background daemons | **`npm run ari`** (call control) + **`npm run worker`** (AI jobs) + **`npm run pnp`** | Reuse `video-to-story`'s DB-backed `queue.ts` claim-loop verbatim for AI jobs. ⚠ tsx restart orphans children — run **exactly one** of each (`pkill -f` first). |
| Auth | `jose` JWT cookie + `bcryptjs` | Seeded admin only (single-tenant, no self-register). |
| AI (async) | STT (Deepgram / local Whisper) → **Claude** summary | Provider seam with **offline mock default** so `npm test` spends no credits (`@anthropic-ai/sdk`). Haiku 4.5 default, Sonnet 5 / Opus 4.8 for heavier work. |
| Dev loop | **Lima + socket_vmnet (bridged)**, Debian 13 guest; Node runs native on the Mac | Bridged = VM gets a real LAN IP → Fanvil + softphones register with **zero NAT pain** (kills one-way-audio). No Docker needed. |

---

## Project layout (feature-isolated per workspace convention)

```
pbx/
├── CLAUDE.md, CODEMAP.md, PROJECTS.md-row, prisma.config.ts
├── prisma/{schema.prisma, seed.ts, migrations/}        # OUR tables only (public)
├── asterisk/                                           # engine config, checked in (dev==prod)
│   ├── lima/pbx.yaml                                   # Lima Debian 13 bridged template
│   ├── build/build-asterisk.sh                         # pinned source build + menuselect
│   ├── etc/{pjsip.conf,sorcery.conf,extconfig.conf,res_odbc.conf,
│   │        ari.conf,http.conf,extensions.conf,cdr*.conf,cel*.conf}
│   └── sql/                                            # raw migrations for asterisk.* (ps_*/cdr/cel)
├── worker/{ari/index.ts, jobs/index.ts, pnp/index.ts} # 3 long-running processes
├── scripts/{originate-test.ts, reconcile.ts, smoke-live.ts}
└── src/
    ├── app/            # admin routes + machine endpoints (provision, media, health)
    ├── features/       # UI + Server Actions, one folder each
    ├── telephony/      # ARI call-control engine (worker-safe)
    ├── provisioning/   # per-vendor config renderers (route-safe)
    ├── ai/             # async AI stages + provider seams (worker-safe)
    └── lib/            # shared infra (worker-safe)
```

**`src/features/`** (each: `actions.ts` + client components, its own file): `auth`, `users`,
`extensions`, `trunks` (+`telnyx-template.ts`), `dids`, `inbound-routes`, `outbound-routes`,
`ring-groups`, `ivr`, `voicemail`, `provisioning`, `guardrails`, `e911`, `reporting`,
`settings`, `system`.

**`src/telephony/`** (the call-control engine): `ariClient.ts` (REST wrapper), `connection.ts`
(outbound-WS lifecycle + reconnect), `stateRecovery.ts` (re-adopt in-flight calls on
reconnect), `dispatcher.ts` (event router), `routing.ts` (StasisStart pipeline),
`destinations/{extension,ringGroup,ivr,voicemail,timeCondition}.ts`, `ivrInterpreter.ts` (DB
flow state machine — **no generated dialplan**), `ringStrategy.ts`, `originate.ts`,
`bridging.ts`, `callSession.ts`, `callRecord.ts`, and `realtime/{psWriter,psSchema,reconcile,
odbcPool}.ts` (Prisma truth → `ps_*` tables).

**`src/provisioning/`**: `renderer.ts` (`interface DeviceRenderer { render(device, ctx):
RenderedConfig }`), `registry.ts`, `context.ts`, `vendors/fanvil.ts` (+ later
`yealink/grandstream/poly`), `secrets.ts`, `sipPnp.ts`.

**`src/ai/`**: `stages/{transcribeVoicemail,summarizeCall}.ts`, `providers/stt/*` +
`providers/llm/*` (mock default + Deepgram/Whisper/Anthropic), `prompts/*`, `media.ts`.

**`src/lib/`**: `db.ts`, `auth.ts`, `guards.ts`, `password.ts`, `crypto-vault.ts`
(AES-256-GCM for SIP/trunk/VM secrets), `env.ts`, `queue.ts` (reused), `engines.ts` (ARI ping
/ STT availability — the `binaries.ts` analogue), `asteriskControl.ts` (module reload),
`phone.ts` (E.164 + dial-pattern match), `guardrail.ts` (toll-fraud engine), `e911.ts`,
`businessHours.ts`, `audit.ts`, `ids.ts` (uniqueid/linkedid ↔ CallRecord).

---

## Data model

**Prisma-owned (`public`)** — key models (fields abbreviated): `User`, `Extension`, `Trunk`,
`Did`, `InboundRoute`, `OutboundRoute`, `RingGroup`+`RingGroupMember`,
`IvrFlow`+`IvrNode`+`IvrOption`, `BusinessHours`, `Device`, `CallRecord`, `Transcript`,
`VoicemailBox`+`VoicemailMessage`, `GuardrailPolicy`+`SpendCounter`+`VelocityCounter`+
`BlockEvent`, `E911Location`, `CompanySettings`, `Setting`, `AuditLog`, `SystemStatus` (ARI
daemon heartbeat, read by UI), `AiJob` (reuses `queue.ts`). Enums: `Role`,
`TrunkProvider/AuthMode`, `DestinationType`, `RingStrategy`, `IvrNodeType`,
`CallDirection/Disposition`, `DeviceVendor`, `GuardrailAction`, `AiJobKind`.

**Asterisk-owned (`asterisk`)** — **raw SQL, never `prisma migrate`**: `ps_endpoints`,
`ps_auths`, `ps_aors`, `ps_endpoint_id_ips`, `ps_registrations`, `ps_contacts`, `ps_globals`,
`cdr`, `cel`. Written by `src/telephony/realtime/psWriter.ts` on a dedicated pg pool:
- **Extension** → `ps_endpoint` + `ps_auth` + `ps_aor`.
- **Trunk** → `ps_endpoint` + `ps_aor` + (`ps_auth` if credential) + N `ps_endpoint_id_ips`
  (identify ACL to Telnyx IPs) + `ps_registration` (if REGISTER).
- After identify/registration writes, `reconcile.ts` triggers a **targeted `res_pjsip`
  reload** via ARI (endpoint/auth/aor lookups are on-demand, no reload).

---

## Call-control design (resilience is the point)

- **Connection:** Asterisk **dials out** to our daemon's ws server; `connection.ts` does
  exponential-backoff reconnect + heartbeat → `SystemStatus`. Single-VM prod = both sides
  localhost (nothing exposed).
- **State recovery:** per-call state is stashed in **Asterisk channel variables** (`CALLREC_ID`,
  `DEST_TYPE/ID`, `IVR_FLOW/NODE`, `RETRIES`) so Asterisk holds the truth; on (re)connect,
  `stateRecovery.ts` enumerates `GET /channels` + `/bridges` and re-adopts in-flight calls. A
  daemon restart mid-call recovers cleanly.
- **StasisStart pipeline (`routing.ts`):** INBOUND → `Did` → `InboundRoute` (± business hours)
  → resolve destination (extension / ring-group / IVR / voicemail / time-condition). OUTBOUND
  → match `OutboundRoute` by priority pattern → `guardrail.evaluate()`
  (BLOCK / PIN_REQUIRED / ALLOW) → strip/prepend → pick trunk (concurrency check) → stamp
  caller-ID **validated against the trunk's DID pool** (STIR/SHAKEN A-attestation; the ITSP
  signs) → `originate PJSIP/<num>@telnyx` + bridge → failover trunk on congestion.
- **IVR** is interpreted from the DB `IvrFlow`/`IvrNode` as a state machine (play → collect DTMF
  → branch) — never generated dialplan.
- **Minimal fallback dialplan (`extensions.conf`)** runs only when the daemon is unregistered:
  basic ext-to-ext `Dial`, a narrow outbound path, and native voicemail — graceful
  degradation, never a hard SPOF. **911 is native-first, bypasses Stasis entirely** so
  emergency calling never depends on our daemon.

---

## Provisioning design

Canonical `Device` (MAC-keyed). `DeviceRenderer.render(device, ctx)` returns
`{ filename, contentType, body, cacheable }`; `registry.ts` picks by vendor; `context.ts`
assembles SIP creds/server/codecs/BLF URIs/firmware from Prisma. **Fanvil renderer** emits the
mandatory **64-byte `<<VOIP CONFIG FILE>>Version:…` header** + sysConf XML (newer) / P-value
(older), filename `{mac}.cfg`. Served over HTTPS at `app/provision/[mac]/route.ts` with a
per-device provisioning token (404 on unknown MAC, rate-limited, audited). **SIP-PnP responder**
(`worker/pnp`) answers multicast `224.0.1.75:5060` `ua-profile` SUBSCRIBE at phone boot with a
tokened HTTPS URL = **zero-touch on-LAN**; Fanvil **FDPS/RPS** handles off-LAN. New vendor = one
new file implementing the same interface.

---

## Dev environment bootstrap (Lima bridged Debian 13, no Docker)

1. `brew install lima socket_vmnet` + configure the socket_vmnet sudoers helper (needed for
   bridged networking).
2. `limactl start asterisk/lima/pbx.yaml` (Debian 13, `networks: [{lima: bridged}]` → real LAN
   IP; `provision:` calls the checked-in `build-asterisk.sh`).
3. `build-asterisk.sh` (in VM): apt build deps (incl. `unixodbc-dev`, `odbc-postgresql`,
   `libsrtp2-dev`, `libjansson-dev`) → fetch pinned Asterisk 22 tag → `configure` + `menuselect`
   (res_ari*, res_pjsip*, res_odbc, res_config_odbc, cdr_pgsql, cel_pgsql, app_voicemail,
   res_pjsip_mwi, res_stasis*) → `make install` → drop `asterisk/etc/*.conf`.
4. **Postgres on the Mac** (superuser `james`): open `pg_hba.conf` to the VM subnet; VM's
   unixODBC DSN → Mac LAN IP:5432, schema `asterisk`. Apply `asterisk/sql/*.sql` (ps_*/cdr/cel)
   **and** `prisma migrate deploy` (public) to the **same DB**.
5. Wire ARA (`extconfig.conf` + `sorcery.conf` + `res_odbc.conf`); `ari.conf` outbound WS →
   `ws://<mac-lan-ip>:<PORT>`; `http.conf` enables `:8088`.
6. Verify: `pjsip show endpoints` reads realtime rows; `ari show apps` lists `pbx-app`.
7. Mac-native Node `.env`: `ARI_BASE_URL=http://<vm-lan-ip>:8088`, `ARI_APP=pbx-app`,
   `ARI_USER/PASS`, ws port, `DATABASE_URL=…localhost`. Run `npm run ari` + `npm run dev` +
   `npm run worker` (+ `npm run pnp` when testing zero-touch).
8. Register a real Fanvil: create Extension in UI → provision → phone REGISTERs to VM LAN IP (no
   NAT) → confirm `pjsip show contacts`. **dev == prod:** the same `build-asterisk.sh` +
   `asterisk/etc/*` + `asterisk/sql/*` provision the prod Debian VM.

---

## Phased roadmap (native Asterisk module vs build in control plane)

**Phase 0 — dev spine (no features):** Lima + Asterisk-from-source + ARA/ODBC/Postgres + ARI
outbound-WS connected → **one call answered + tone played from Node** via
`scripts/originate-test.ts`. Prove kill-daemon-mid-call recovery.

**Phase 1 — MVP:** extensions (chan_pjsip + `psWriter`) · Telnyx trunk (template first) ·
inbound/outbound routing (`routing.ts`) · ring groups (`ringStrategy` via ARI) · **voicemail +
VM-to-email** (native `app_voicemail` + `res_pjsip_mwi`) · Fanvil provisioning + SIP-PnP ·
CDR/reporting (native `cdr_pgsql`/`cel_pgsql` + CallRecord overlay) · guardrails/toll-fraud
(`guardrail.ts` in originate path) · E911 (native-first 911 + go-live validation gate) · admin
UI + JWT auth · fallback dialplan.

**Phase 2:** queues (native `app_queue`) · recording (native `MixMonitor`) · conferencing
(native `app_confbridge`) · parking (native `res_parking`) · BLF/presence (native
`res_pjsip_pubsub`/hints) · WebRTC softphone (native wss transport + SIP.js client) · reporting
dashboards · **async AI: voicemail transcription + call summaries** (`src/ai/*`).

**Phase 3:** real-time AI voice agent (native externalMedia over **chan_websocket ≥22.8.0** /
AudioSocket fallback; STT→LLM→TTS loop + barge-in in its own process) · live agent-assist ·
visual flow designer (UI over `IvrFlow`/`IvrNode`) · AI outbound (guardrail-gated).

**Net effort:** ~70% control-plane orchestration, ~30% telephony config. Almost nothing needs a
from-scratch media stack.

---

## Verification plan

- **Phase 0:** `ari show apps` shows `pbx-app`; softphone registers (`pjsip show contacts`,
  proves realtime ps_*); `originate-test.ts` drives a call into Stasis, Node answers + plays;
  **kill/restart the daemon mid-call** → reconnect + `stateRecovery` re-adopts.
- **Phase 1:** real Fanvil + softphone register (bridged, no NAT); ext↔ext both ways; inbound
  PSTN via a **Telnyx test DID** → ext/ring-group/IVR; outbound PSTN (caller-ID in DID pool);
  guardrails (intl blocked by default, concurrency/velocity trip → `BlockEvent`); no-answer →
  native VM records → email arrives → `VoicemailMessage` indexed; factory-reset Fanvil → SIP-PnP
  zero-touch; CDR row + finalized CallRecord per call; E911 via a **coordinated carrier test**
  (never a live 911), notification fires, go-live gate blocks an unvalidated emergency DID.
- **Offline `npm test`** (hermetic, mock providers via `test/setup.ts`): guardrail engine,
  dial-pattern matcher, IVR interpreter (mock ARI), `psWriter` SQL builders, **Fanvil renderer
  golden output**, E.164 util, business-hours evaluator, queue claim/heartbeat.
- **`npm run build`** = typecheck gate. **`npm run smoke:live`** (opt-in, real credits): one real
  ARI originate+hangup, one Telnyx test call, one Deepgram + one Claude summary.

---

## Top risks & mitigations (full-custom-control-plane specific)

1. **Control-plane SPOF / loss of dial-tone.** → Native **fallback dialplan** (ext-to-ext,
   narrow outbound, native VM); **911 native-first, never via Stasis**; systemd auto-restart;
   outbound-WS auto-reconnect; single-instance discipline (tsx-orphan gotcha); health endpoint.
2. **State recovery on reconnect.** → Stash per-call state in **channel variables**; on connect
   enumerate `/channels`+`/bridges` and re-adopt; unknown channels → `continueInDialplan(fallback)`.
   Test by killing the daemon mid-call.
3. **`ps_*` realtime reload/qualify quirks.** → Keep transports + globals in `pjsip.conf`;
   `reconcile.ts` targeted `res_pjsip` reload after identify/registration writes; never write
   `ps_contacts`; reconcile-hash in `SystemStatus` + admin "reconcile-all" button.
4. **Toll fraud (existential $).** → Guardrails day one (intl OFF + PIN; concurrent +
   per-destination velocity + per-trunk spend caps that **auto-BLOCK**); SIP hardening (TLS/SRTP,
   **fail2ban** on Asterisk security log, strict identify ACLs to Telnyx IPs, strong per-extension
   secrets); trunk `maxChannels`.
5. **E911 (Kari's Law + RAY BAUM'S — legal).** → **911 native-first**; per-device dispatchable
   location + callback; on-site notification runs natively; **go-live validation gate** blocks an
   emergency DID until location is validated; coordinated carrier test.
6. **AI latency (why real-time is deferred).** → Phase-1 AI is **async only** (post-call, off the
   media path — no call blocks on AI); design the externalMedia seam now, build the live loop in
   Phase 3 in a separate process with hard timeouts + hand-to-human fallback.
7. **ARI client-lib immaturity.** → Own pinned thin wrapper over REST + `ws`; contract-test in
   `smoke:live`.
8. **Two schema owners in one Postgres.** → Separate schemas (`asterisk` vs `public`); Asterisk
   tables via raw SQL only; `prisma migrate` never touches `asterisk`; boundary documented in
   `CLAUDE.md`; identical scripted Asterisk build for Lima and prod.

---

## First steps (new-project checklist)

1. ✅ Create `/Users/jamesai/Desktop/claude/pbx/` with `CLAUDE.md`, `CODEMAP.md`, `BUILD-PLAN.md`,
   `NEXT-STEPS.md`, `.gitignore`, `git init` + first commit, and a row in root `PROJECTS.md`.
2. Scaffold Next.js 16 + Prisma 7 + Tailwind v4 mirroring `video-to-story` (`src/lib/db.ts`,
   `prisma.config.ts`, provider-seam + offline-mock pattern, `queue.ts`).
3. **Phase 0 dev spine first** — stand up Lima + Asterisk 22 + ARI, drive one call into
   `Stasis()` from Node and prove reconnect recovery, **before** building any feature.

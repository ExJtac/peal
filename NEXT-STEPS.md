# NEXT STEPS — pbx

**Resume here.** Full detail in `BUILD-PLAN.md`; navigation in `CODEMAP.md`; conventions in
`CLAUDE.md`. Working dir: `/Users/jamesai/Desktop/claude/pbx/`.

## ▶ RESUME HERE — EDIT-existing-record added to every admin list page (2026-07-21)
User: could create + delete records (extensions, routes, DIDs, users, etc.) but **couldn't edit** them.
Fixed across all ten admin list pages. **Green: `npm run build` + 103 tests.** Pattern (reference
`src/app/(admin)/outbound/page.tsx`): the "Add" form doubles as an **edit form** via a `?edit=<id>` URL
param — pre-filled fields, a hidden `id`, dynamic heading/button, a Cancel link; each table row gets an
**Edit** link + `.row-editing` highlight. Most `saveX` actions already supported update-by-id (edit was a
pure UI gap); **business-hours** was create-only and got update support added (+ its Json `rules` array is
unflattened back into the day/time fields for prefill).
- **Covered:** extensions, trunks, dids, inbound, outbound, ring-groups, users, e911, business-hours, provisioning.
- **Identity fields locked in edit mode** (renaming would orphan Asterisk `ps_*` rows): extension `number`,
  trunk `name`, device `mac` are `readOnly` (still submit, can't change → delete+recreate to rename).
- **Trunks** is a client form (`trunk-form.tsx`): takes an `initial` prop, seeds state from the stored trunk,
  `key`-remounts per row; password blank = keep existing.
- **Not needed:** voicemail (only a transcribe toggle, boxes derive from extensions), guardrails/settings
  (singleton forms already show current values), ivr/ai-agents (already had `[id]` editors).
- **Verified live** against the dev server on :3001: outbound full round-trip; extensions/trunks/provisioning
  readOnly-identity + prefill; business-hours rules-unflatten (3 day boxes + times + holiday); users pw-keep note.

## ▶ EARLIER — Telnyx/PSTN trunk go-live PREPPED (no account yet) (2026-07-21)
The user wants real PSTN (was "Telnyx", now leaning **bandwidth.com** but undecided, **no trunk account
yet**). The trunk plumbing was already built + correct; this session did the credential-free prep +
fixed real gaps a live trunk would have hit. **Green: `npm run build` + 103 tests.** Full operator
runbook in **`TRUNK-SETUP.md`**.

**The decisive finding (verified via a research workflow + Asterisk NAT docs):** the dev VM is Lima
**vzNAT = double-NAT'd** to the internet with no port-forward, so **auth mode matters more than the
provider**. A **REGISTER (credentials)** trunk registers OUT to the ITSP and holds a NAT pinhole, so
inbound PSTN returns down it — works behind NAT. An **IP-auth** trunk (Bandwidth's model, also Skyetel;
Twilio *inbound*) needs the ITSP to reach a public IP the VM doesn't have. So for the **home/dev test,
use Telnyx or VoIP.ms (REGISTER)**; Bandwidth is a production/public-host choice.

**Shipped this session (all on `main` after this commit):**
- **Transport bug fixed** — `psSchema.ts` hardcoded `transport-udp` on the trunk endpoint + registration
  (a TLS/TCP trunk silently used UDP). Now honors `trunk.transport` (+ `sips:`/`;transport=` URIs).
- **NAT correctness (from the verified research)** — `registrationRowForTrunk` now sets **`line=yes` +
  `endpoint=<trunk>` + `expiration=120`** so inbound INVITEs down the REGISTER pinhole bind to the
  endpoint even with NO identify row (VoIP.ms/generic); AOR **`qualify_frequency` 60→30 + `qualify_timeout=3`**
  to stay under home-router UDP NAT timeouts. `external_*` correctly left UNSET (symmetric RTP covers it).
- **Provider-agnostic setup** — `provider-templates.ts` (Telnyx/VoIP.ms/Bandwidth/Twilio/Generic) + a
  client `trunk-form.tsx` picker that auto-fills each provider's SIP settings and **warns when a provider
  can't do inbound behind NAT** (Bandwidth, Twilio-inbound). Replaced the single `telnyx-template.ts`.
- **Live outbound smoke** — `scripts/pstn-smoke.ts` (`npm run smoke:pstn -- +1NUMBER [trunk]`): originates
  a real call out a trunk, watches Ringing→Up, prints pass/fail + an inbound test checklist.
- **Seed footgun** — the demo `telnyx` trunk defaulted to `IP_AUTH`; now `REGISTER` (the NAT-friendly path).
- **`test/psSchema.test.ts`** (new — first coverage of psSchema: trunk + extension ps_* rows) + `TRUNK-SETUP.md`.
- **Verified:** `npm run build` + 103 tests; authenticated `/trunks` SSR renders the new form (200, all
  providers, NAT warnings, no error boundary), driven against the live dev server on :3001.

**To actually GO LIVE (needs the user — gated on a trunk account):**
1. Pick a **REGISTER-capable** provider (Telnyx = instant + test credit; VoIP.ms = cheapest). Create a
   **Credentials** SIP connection + buy a DID. (Bandwidth only on a public host — see TRUNK-SETUP.md.)
2. `/trunks` → pick provider → paste SIP username/password → Register + Enabled.
3. `/dids` add the DID → `/inbound` route it → `/outbound` route (caller-ID = your DID).
4. In the VM: `asterisk -rx "module reload res_pjsip.so"` then `pjsip show registrations` → Registered.
5. Test: `npm run smoke:pstn -- +1YOURCELL`; then call the DID inbound.

**Deferred hardening noted by the research (not blocking):** flip the Prisma `Trunk.authMode` default
IP_AUTH→REGISTER (needs a migration + dev/worker restart — left for when we next migrate); re-verify the
hard-coded Telnyx `authIps` against current Telnyx docs before relying on IP_AUTH; TLS/SRTP + fail2ban for prod.

## Where we are ✅ (in-browser calling + AI receptionist LIVE)
Built, green (`npm run build` + 89 tests), and the ARI + realtime + WebRTC + AI-voice stack is
verified running in the VM (`npm run smoke:ai` passes end-to-end):
- **Admin console** (`/`, Admin/Manager): extensions, trunks, DIDs, inbound/outbound routes,
  ring groups, IVR/auto-attendant builder, business hours, provisioning, guardrails, E911,
  reporting, settings, users.
- **Roles:** Admin (all) · Manager (config + reports) · User (portal only). Login routes by role.
- **User portal** (`/portal`, User): **in-browser WebRTC softphone** (SIP.js), call history,
  voicemail w/ AI summaries, DND. Works with no desk phone.
- **Engine:** Asterisk 22.10 in the Lima VM reads extensions live from Postgres via ODBC realtime;
  `transport-ws` up for WebRTC; the Mac ARI daemon is connected.
- **Call recording → AI summaries:** a Settings toggle records each connected call; on hangup the
  AI worker pulls the recording from Asterisk (ARI), transcribes it, and Claude writes a summary +
  action items + sentiment — shown in Reporting (with an audio player) + the portal. **Mock AI by
  default (free)**; for real transcription set `DEEPGRAM_API_KEY` + `STT_PROVIDER=deepgram` +
  `ANTHROPIC_API_KEY` in `.env` (small per-call cost). Recording needs a real 2-party call.
- **AI receptionist (flagship):** a call to an `AI_AGENT` destination is answered by Claude over a
  live externalMedia RTP loop (VAD→STT→Claude tool-use→TTS, with barge-in + transfer/voicemail).
  Configure at `/ai-agents`; **mock-default (free)**. Details in the section below.

Logins (all `password123`): `admin@pbx.local` (ADMIN) · `manager@pbx.local` (MANAGER) ·
`user@pbx.local` (USER, ext 2001 WebRTC → portal).

## How to run it (after a reboot / fresh terminal)
```bash
limactl start pbx                       # boots Asterisk (systemd auto-starts it)
cd ~/Desktop/claude/pbx
npm run dev                             # admin+portal → http://localhost:3001 (3000 is video-to-story)
npm run ari                             # ARI call-control daemon — EXACTLY ONE (pkill -f worker/ari first)
npm run worker                          # async-AI jobs — exactly one (optional until AI is exercised)
```
Then open http://localhost:3001. Health: `curl localhost:3001/api/health` → `ariConnected:true`.

## Test in-browser calling
1. http://localhost:3001 → log in `user@pbx.local` / `password123` → the phone portal.
2. Allow the microphone. Softphone shows **Ready** (registered as ext 2001).
3. Two-way audio proof: `npx tsx scripts/originate-test.ts PJSIP/2001` → the browser rings →
   Answer → hear the demo message.
4. Browser-to-browser: make a 2nd WebRTC extension (Extensions → check "WebRTC") + a 2nd User
   linked to it, log in from another browser/profile, and call between them.

## Networking facts (this Mac, no sudo needed)
- VM is reachable from the Mac at **192.168.64.2** (its `lima0` interface, via `bridge100`);
  the Mac is **192.168.64.1** to the VM. Browser softphone → `ws://192.168.64.2:8088/ws`.
- Asterisk ODBC → Mac Postgres at **192.168.64.1** (opened via `postgresql.conf`
  `listen_addresses` + `pg_hba.conf` `192.168.64.0/24 trust`; backups at `*.pbxbak`).
- **VM Asterisk fixes applied** (also in the repo `asterisk/etc/*` for fresh builds):
  `noload cdr_pgsql/cel_pgsql` (heap-corruption on missing table), odbc.ini
  `standard_conforming_strings=off` (PG escape crash), `transport-ws` needs a `bind`.
  `.env` has `SIP_SERVER_HOST=192.168.64.2`. Re-sync extensions to Asterisk: `npm run db:reconcile`.

## ✅ Real-time AI receptionist — BUILT + verified live (the flagship)
A call routed to an **`AI_AGENT`** destination is answered by Claude over a live **externalMedia
RTP** loop: VAD → streaming STT → Claude (tool-use) → streaming TTS, injected as paced RTP, with
**barge-in**, and it can **transfer to a human / take a voicemail / answer questions / end the call**.
- **Configure:** `/ai-agents` (Admin/Manager) → create an agent (greeting, persona, business
  context/FAQ, transfer target, voicemail ext, fallback, VAD tuning). Then point any DID / inbound
  route / IVR option / business-hours / ring-group-failover at **AI Receptionist** with the agent id.
- **Mock by default (free):** the whole pipeline runs offline — the AI speaks a placeholder tone and
  uses rule-based replies. For real speech set in `.env`: `REALTIME_STT_PROVIDER=deepgram` +
  `DEEPGRAM_API_KEY`, `REALTIME_TTS_PROVIDER=deepgram|elevenlabs` (+ key/`ELEVENLABS_VOICE_ID`),
  `ANTHROPIC_API_KEY` (brain, Haiku 4.5 default via `AGENT_LLM_MODEL`). `MEDIA_HOST=192.168.64.1`
  (Mac↔VM) + `RTP_PORT_START/END` (default 40000-40099) drive the media path.
- **Verify live (mock):** `npx tsx scripts/ai-smoke.ts` routes a real call → agent → checks the
  media loop connected + greeting injected + **no leaked RTP port** on teardown. There's a demo
  `Smoke Receptionist` agent + DID `5559001` → AI_AGENT already seeded by that script.
- **Left for real STT/TTS keys:** a full multi-turn conversation with real intent (the offline smoke
  proves the media path + greeting + teardown; multi-turn needs alternating caller audio / real STT).

## What to build next (recommended order)
1. **Wire the Telnyx trunk → real PSTN** (bring-your-own SIP): real inbound/outbound to the
   outside world. The trunk/outbound-route/DID model is built — needs the Telnyx account plugged
   in + tested. This is what makes it a full 3CX replacement (right now calling is internal + browser).
2. **Call-center: queues/ACD** — hold music, wait position, agent login, live wallboard.
3. **Then:** conferencing, call parking, BLF/presence; SIP/toll-fraud hardening (fail2ban,
   TLS/SRTP); extension/ring-group edit pages; per-model Fanvil verification; native mobile softphone.

## Home test with the physical Fanvil (PoE)
A real desk phone (separate LAN device) needs the VM on the same LAN — switch to **bridged**
networking: edit `asterisk/lima/pbx.yaml` to the bridged block (`brew install socket_vmnet` +
`limactl sudoers` — needs sudo), restart the VM, set `SIP_SERVER_HOST` to the VM's LAN IP, add the
phone by MAC in `/provisioning`, point its auto-provision URL at the shown `/provision/<mac>.cfg?token=…`.

## Standing reminders
- **Run exactly one** `npm run ari` and one `npm run worker` (tsx orphans children — `pkill -f` first).
- `prisma migrate` never touches schema `asterisk` (raw SQL via `npm run db:asterisk`).
- **911 native-first — never through Stasis.** Guardrails ON (international OFF by default).
- Green before commit (`npm run build` + `npm test`); commit feature work directly to `main`.

# NEXT STEPS — pbx

**Resume here.** Full detail in `BUILD-PLAN.md`; navigation in `CODEMAP.md`; conventions in
`CLAUDE.md`. Working dir: `/Users/jamesai/Desktop/claude/pbx/`.

## Where we are ✅ (in-browser calling LIVE)
Built, green (`npm run build` + 48 tests), and the ARI + realtime + WebRTC stack is verified
running in the VM:
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

## What to build next (recommended order)
1. **Wire the Telnyx trunk → real PSTN** (bring-your-own SIP): real inbound/outbound to the
   outside world. The trunk/outbound-route/DID model is built — needs the Telnyx account plugged
   in + tested. This is what makes it a full 3CX replacement (right now calling is internal + browser).
2. **Real-time AI receptionist** (the flagship): STT→Claude→TTS over the live call — answers,
   understands intent ("reschedule my appointment"), routes or handles it. The WebRTC/externalMedia
   media path already works, so this is now feasible. Biggest differentiator vs 3CX.
3. **Call-center: queues/ACD** — hold music, wait position, agent login, live wallboard.
4. **Then:** conferencing, call parking, BLF/presence; SIP/toll-fraud hardening (fail2ban,
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

# NEXT STEPS — pbx

**Resume here.** Full detail in `BUILD-PLAN.md`; navigation in `CODEMAP.md`; conventions in
`CLAUDE.md`. Working dir: `/Users/jamesai/Desktop/claude/pbx/`.

## Where we are
- ✅ Architecture decided + approved: **Asterisk 22 + full custom Node/TS control plane via ARI.**
- ✅ Decisions locked: full custom control plane · async AI first · Telnyx trunk (generic BYO
  model) · single-tenant, ≤25 phones.
- ✅ Project folder scaffolded (this file, `CLAUDE.md`, `CODEMAP.md`, `BUILD-PLAN.md`, `.gitignore`,
  git repo, root `PROJECTS.md` row).
- ⬜ **No app code yet.** Next session starts at Phase 0.

## Phase 0 — prove the spine (do this FIRST, before any feature)
Goal: one real call flows into our Node code and back, and survives a daemon restart.
1. `brew install lima socket_vmnet` + configure the socket_vmnet sudoers helper (bridged networking).
2. Scaffold the Next.js 16 + Prisma 7 + Tailwind app mirroring `../video-to-story`
   (`src/lib/db.ts`, `prisma.config.ts`, `.env.example`, `test/setup.ts`, provider-seam +
   offline-mock pattern, reuse `lib/queue.ts`). `createdb pbx`.
3. Write `asterisk/lima/pbx.yaml` + `asterisk/build/build-asterisk.sh` (pinned Asterisk 22 tag,
   menuselect: res_ari*, res_pjsip*, res_odbc, res_config_odbc, cdr_pgsql, cel_pgsql,
   app_voicemail, res_pjsip_mwi, res_stasis*). `limactl start`.
4. Wire Postgres two-owner: `asterisk/sql/001_ps_tables.sql` (+ cdr/cel) in schema `asterisk`;
   ODBC DSN from the VM → Mac Postgres; `extconfig.conf` + `sorcery.conf` + `res_odbc.conf`;
   `pjsip.conf` (transports only) + `ari.conf` (outbound WS) + `http.conf`.
5. Build `src/telephony/{ariClient,connection,stateRecovery,dispatcher}.ts` skeletons +
   `scripts/originate-test.ts`.
6. **Verify:** `ari show apps` lists `pbx-app`; a softphone registers (`pjsip show contacts`,
   proves realtime ps_*); `originate-test.ts` drives a call into `Stasis()`, Node answers +
   plays a tone; **kill/restart `npm run ari` mid-call → reconnect re-adopts the channel.**

## Then → Phase 1 MVP
Extensions · Telnyx trunk · inbound/outbound routing · ring groups · voicemail + VM-to-email ·
Fanvil provisioning + SIP-PnP · CDR/reporting · guardrails (toll-fraud) · E911 (native-first
911 + go-live gate) · admin UI + auth · fallback dialplan. See `BUILD-PLAN.md` → roadmap.

## Standing reminders
- **Run exactly one** `npm run ari` and one `npm run worker` (tsx orphans children — `pkill -f` first).
- `prisma migrate` **never** touches schema `asterisk`.
- **911 native-first — never through Stasis.** Toll-fraud guardrails ON from day one.
- Real API/engine spend: < $10 total → just do it; ≥ $10 → confirm the estimate first.
- Green before commit (`npm run build` + `npm test`); commit feature work directly to `main`.

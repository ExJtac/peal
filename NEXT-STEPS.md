# NEXT STEPS — pbx

**Resume here.** Full detail in `BUILD-PLAN.md`; navigation in `CODEMAP.md`; conventions in
`CLAUDE.md`. Working dir: `/Users/jamesai/Desktop/claude/pbx/`.

## Where we are ✅
The whole software platform is built and green (`npm run build` + `npm test` = 48 tests pass):
- **Admin app** (Next 16 + Prisma 7/Postgres): auth, dashboard, extensions, trunks, DIDs,
  inbound/outbound routes, ring groups, provisioning, guardrails, E911, reporting, settings.
- **ARI call engine** (`src/telephony/*`): connection+reconnect+state-recovery, StasisStart
  routing (internal/inbound/outbound), dial-groups (ring, first-answer-wins), IVR interpreter,
  toll-fraud guardrails, voicemail hand-off, CDR overlay, realtime `ps_*` writer.
- **Provisioning** (Fanvil renderer golden-tested), **async AI** (VM/call transcription +
  Claude summaries, mock-default), **3 workers** (`ari`/`worker`/`pnp`).
- **Asterisk engine artifacts** (`asterisk/*`): source-build script, Lima VM template, all
  configs, `ps_*`/cdr/cel SQL. Seed: admin `admin@pbx.local` / `password123`, exts 1001/1002.

## Tomorrow at the office — bring the engine up + make a real call
The app runs on the Mac; Asterisk runs in the Lima Debian VM. Get them talking, then a phone.

1. **VM up:** `limactl start pbx` (image + Asterisk compile may already be done — check
   `limactl list`). Get the VM IP: `limactl shell pbx ip route`.
2. **Fill placeholders** the build agent flagged:
   - `asterisk/etc/ari.conf` → set `[pbx]` password = `.env` `ARI_PASSWORD` (`pbx-dev-ari-pass`).
   - `asterisk/etc/odbc.ini`, `cdr_pgsql.conf`, `cel_pgsql.conf` → set `MAC_HOST_IP` = the
     Mac's IP as seen from the VM (`limactl shell pbx ip route | grep default`, typically
     `192.168.64.1`). Mac `pg_hba.conf` must allow the VM subnet for role `james`.
3. **Apply Asterisk schema + reconcile:** `npm run db:asterisk` (creates schema `asterisk` +
   ps_*/cdr/cel), then reconcile ps_* from seeded extensions (add a `scripts/reconcile.ts`
   calling `reconcileAll()`, or save each extension once in the UI).
4. **Point the app at the VM:** in `.env` set `ARI_HTTP_URL=http://<vm-ip>:8088` and
   `SIP_SERVER_HOST=<vm-ip>`. Start everything: `npm run dev`, `npm run ari` (exactly one),
   `npm run worker`.
5. **Verify the spine:** in the VM `asterisk -rx "ari show apps"` (expect `pbx-app`) and
   `pjsip show endpoints` (expect the realtime extensions). Dashboard should show "Connected".
6. **Register a phone:** softphone (Zoiper/Linphone) → server `<vm-ip>`, user `1001`, password
   = the seeded SIP secret (or set your own in the UI). `pjsip show contacts` shows it.
7. **Place calls:** 1001 → 1002 (internal). Run `tsx scripts/originate-test.ts PJSIP/1001` to
   have the server call the phone + play a demo message (proves ARI↔app↔media).
8. **Fanvil:** add each phone by MAC in `/provisioning`, point the phone's auto-provision URL
   at the shown `/provision/<mac>.cfg?token=…` (bridged networking for on-LAN registration —
   flip `asterisk/lima/pbx.yaml` to the bridged block).
9. **Trunk (when ready):** fill the Telnyx trunk in `/trunks`, enable it + the outbound route,
   add a DID + inbound route → real PSTN calls.

## Standing reminders
- **Run exactly one** `npm run ari` and one `npm run worker` (tsx orphans children — `pkill -f` first).
- `prisma migrate` **never** touches schema `asterisk` (raw SQL only).
- **911 native-first — never through Stasis.** Guardrails ON (international OFF by default).
- The Fanvil config format is locked by a golden test — verify against a real handset and
  tweak `src/provisioning/vendors/fanvil.ts` per model if a key is rejected.
- Real API/engine spend: < $10 total → just do it; ≥ $10 → confirm the estimate first.
- Green before commit (`npm run build` + `npm test`); commit feature work directly to `main`.

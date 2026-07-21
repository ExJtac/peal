# NEXT STEPS — pbx

**Resume here.** Full detail in `BUILD-PLAN.md`; navigation in `CODEMAP.md`; conventions in
`CLAUDE.md`. Working dir: `/Users/jamesai/Desktop/claude/pbx/`.

## Where we are ✅ (spine PROVEN)
The whole software platform is built, green (`npm run build` + `npm test` = 48 tests), and the
risky ARI integration is **proven end-to-end**:
- **Admin app** (Next 16 + Prisma 7/Postgres): auth, dashboard, extensions, trunks, DIDs,
  inbound/outbound routes, ring groups, provisioning, guardrails, E911, reporting, settings —
  all 12 authenticated pages verified rendering. Admin: `admin@pbx.local` / `password123`.
- **ARI call engine** drives calls: connection+reconnect+state-recovery, routing, dial-groups,
  IVR interpreter, guardrails, voicemail hand-off, CDR, realtime `ps_*` writer.
- **Asterisk 22.10 is BUILT + RUNNING in the Lima VM** (`limactl` instance `pbx`); 358 modules
  loaded, PJSIP transports up on :5060, ARI REST authenticating.
- **The Mac daemon connects to the VM's Asterisk** (Lima auto-forwards :8088 → localhost): our
  `pbx-app` Stasis app is registered; dashboard health shows `ariConnected: true`.
- **DB fully wired locally:** `asterisk` schema created (`npm run db:asterisk`) and `ps_*`
  populated from the seeded extensions (`npm run db:reconcile`) — `ps_endpoints` has 1001/1002.

**One fix applied tonight:** `asterisk/etc/modules.conf` no longer `noload`s `manager.so`
(it's a built-in in Asterisk 22 — noloading it fatally crash-loops the boot).

## Tomorrow at the office — close the last hop + a real phone
The only missing link is **Asterisk (in the VM) reading `ps_*` from the Mac's Postgres over
ODBC**, then a phone. Everything above already works.

1. **Restart the pieces if the Mac rebooted:** `limactl start pbx`;
   `cd pbx && npm run dev` (UI, :3001) + `npm run ari` (daemon — exactly one). Dashboard should
   show "Connected" (proves ARI again).
2. **Let the VM reach the Mac's Postgres** (the last hop):
   - Get the Mac's IP as seen from the VM: `limactl shell pbx ip route | grep default`
     (the gateway) — this is **MAC_HOST_IP**.
   - Make Homebrew Postgres listen beyond localhost: in `postgresql.conf` set
     `listen_addresses = '*'` (or the VM subnet); in `pg_hba.conf` add a line allowing the VM
     subnet for user `james` (trust or md5); `brew services restart postgresql@14`.
   - In the VM set the placeholder: `sudo sed -i "s/MAC_HOST_IP/<gateway-ip>/g"
     /etc/asterisk/odbc.ini /etc/asterisk/cdr_pgsql.conf /etc/asterisk/cel_pgsql.conf` then
     `sudo systemctl restart asterisk`.
   - Verify realtime reads: `limactl shell pbx asterisk -rx "odbc show"` (active connection > 0)
     and `pjsip show endpoints` (should list 1001, 1002 from the DB).
3. **Register a softphone** (Zoiper/Linphone on the Mac/LAN): server = the VM (for LAN phones
   use the bridged network block in `asterisk/lima/pbx.yaml`; on the Mac a softphone can use the
   forwarded 127.0.0.1:5060 or the VM IP), user `1001`, password = the seeded SIP secret (reset
   it in the Extensions UI to something you know — saving re-writes `ps_*`). Confirm with
   `pjsip show contacts`.
4. **Place calls:** 1001 → 1002 (internal). `tsx scripts/originate-test.ts PJSIP/1001` has the
   server call the phone + play a demo message (proves ARI↔app↔media with real audio).
5. **Fanvil:** add each phone by MAC in `/provisioning`; point its auto-provision URL at the
   shown `/provision/<mac>.cfg?token=…`. For on-LAN phones flip `asterisk/lima/pbx.yaml` to the
   bridged (socket_vmnet) network so the phone can reach the VM's :5060.
6. **Trunk (Telnyx):** fill the trunk in `/trunks`, enable it + the outbound route, add a DID +
   inbound route → real PSTN in/out. (Verify Fanvil config against a real handset — it's locked
   by a golden test; tweak `src/provisioning/vendors/fanvil.ts` per model if a key is rejected.)

## Standing reminders
- **Run exactly one** `npm run ari` and one `npm run worker` (tsx orphans children — `pkill -f` first).
- `prisma migrate` **never** touches schema `asterisk` (raw SQL via `npm run db:asterisk`).
- **911 native-first — never through Stasis.** Guardrails ON (international OFF by default).
- Real API/engine spend: < $10 total → just do it; ≥ $10 → confirm the estimate first.
- Green before commit (`npm run build` + `npm test`); commit feature work directly to `main`.

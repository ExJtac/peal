# PBX — Production Hardening & Go-Live Runbook

The dev setup runs the Node control plane on the Mac against Asterisk in a Lima VM. **Production** is
a single Debian VM running Asterisk + the Node control plane + Postgres together. This runbook takes
that box from "it runs" to "a business runs on it unattended." Work top-to-bottom; each step is
independent and reversible.

Most of the mechanics already exist in the repo — this is the checklist for turning them on.

> **Used the one-command installer ([INSTALL.md → Path 0](INSTALL.md#path-0--one-command-install-recommended))? Most of this is already done for you:**
> control-plane supervision (§1), nightly backups (§2) + the health timer (§3), **ARI/AMI password
> generation + sync into `ari.conf`/`manager.conf` (§4)**, the **fail2ban jail + a LAN-scoped nftables
> firewall with loopback-only AMI/Postgres (§8)** are all applied automatically. What still needs you:
> verify a restore (§2), add an **external** uptime check (§3), rotate the seeded admin login (§4),
> enable TLS/SRTP if you want it (§9–10), and do the per-deployment E911 + trunk go-live (§7,
> `TRUNK-SETUP.md` — including opening the trunk IPs: `nft add element inet pbx trunk_ips { <IP> }`).

---

## 1. Supervise the control plane (P0 — do first)
Only Asterisk self-heals by default; the Node processes must too.
```bash
# in the prod VM, from a writable checkout (e.g. /opt/pbx)
PBX_DIR=/opt/pbx bash asterisk/build/install-control-plane.sh
```
Installs systemd units (`asterisk/build/systemd/*`): `pbx-ari`, `pbx-worker`, `pbx-pnp`, `pbx-web`
(all `Restart=always`, `KillMode=control-group` so a restart reaps tsx's children — no orphan
races), plus the `pbx-backup.timer` + `pbx-health.timer`. Edit the rendered `/etc/pbx/pbx.env`
(DATABASE_URL, ARI_PASSWORD, SMTP_*, ALERT_EMAIL, …) before starting.
**Verify:** `systemctl start pbx-ari; kill $(systemctl show -p MainPID --value pbx-ari)` → it
restarts in ~2s and re-adopts in-flight calls (`journalctl -u pbx-ari`).

## 2. Automated Postgres backups (P0)
`pbx-backup.timer` runs `scripts/backup-db.sh` daily (`pg_dump` of the whole DB — both `public` and
`asterisk` schemas — with retention). Set `PBX_BACKUP_DIR`/`PBX_BACKUP_KEEP` in `pbx.env`.
**Verify a restore:** `createdb scratch && pg_restore -d scratch /var/backups/pbx/pbx-*.dump`.

## 3. Health alerting (P1)
`pbx-health.timer` runs `scripts/health-check.ts` every 2 min: emails `ALERT_EMAIL` when the ARI
daemon drops or its heartbeat goes stale, and a recovery notice when it returns (deduped by a marker
file, delivered via the SMTP seam). Pair with an **external** uptime check against `/api/health`
(that covers a total host outage, which in-box monitoring can't).

## 4. Rotate credentials (P1)
- **Seed passwords:** seed a fresh prod DB with `SEED_PASSWORD=<strong>` (else it warns + uses the
  demo `password123`). Rotate any existing logins in the Users admin.
- **ARI password:** set a real `ARI_PASSWORD` in `pbx.env` AND `/etc/asterisk/ari.conf` (`[pbx]
  password=`, replacing `CHANGEME_ARI_PASSWORD`) — they must match. *(Path 0's installer does this for
  you: `npm run secrets:write` generates `ARI_PASSWORD`/`AMI_PASSWORD` and fans them into
  `ari.conf`/`manager.conf`. Run it by hand to (re)sync any time.)*
- **Secrets at rest:** set `CRED_SECRET` (AES key for stored SIP/trunk secrets) + `AUTH_SECRET`
  (JWT). Both must be stable — rotating `CRED_SECRET` invalidates stored secrets.

## 5. Login lockout (P1 — already on)
`LOGIN_MAX_FAILS` (5) / `LOGIN_LOCK_SECONDS` (300) throttle password guessing at the app layer
(`src/lib/loginThrottle.ts`). Tune in `pbx.env`.

## 6. Guard the destructive-migration footgun (P1 — already on)
Never run `prisma migrate reset` directly (it would drop the `asterisk` schema — live SIP
registrations + CDR). Use `npm run db:reset`, which runs `scripts/guard-reset.ts` first and refuses
when the `asterisk` schema has tables. For defense-in-depth, give the `asterisk` schema a separate
owning role the migrate role can't drop.

## 7. E911 on-site notification (P1 — Kari's Law)
The `[emergency]` dialplan calls `asterisk/scripts/e911-notify.sh` **before** the 911 Dial (the
script backgrounds its work, so it never delays the call). It POSTs to `/api/e911/notify`, which
emails the on-site contact + writes an `E911_CALL` audit row.
```bash
# in the VM: /etc/asterisk/e911-notify.env  (0640, owned by asterisk)
E911_NOTIFY_URL="http://127.0.0.1:3001/api/e911/notify"
E911_NOTIFY_TOKEN="<same value as the app's E911_NOTIFY_TOKEN>"
```
Set `E911_NOTIFY_TOKEN` + `E911_ALERT_EMAIL` in `pbx.env` too.
**Note:** actual 911 *call completion* still needs the carrier `telnyx-emergency` PJSIP endpoint +
per-device `DEVICE_CALLBACK` — provision those when the PSTN trunk goes live (see `TRUNK-SETUP.md`).

## 8. fail2ban on the SIP security log (P1 — before any WAN exposure)
App guardrails don't cover SIP registration attacks. Install the jail:
```bash
apt-get install -y fail2ban
cp asterisk/security/pbx-asterisk.local /etc/fail2ban/jail.d/pbx-asterisk.local
systemctl restart fail2ban && fail2ban-client status asterisk
```
It tails `/var/log/asterisk/security` (already enabled in `logger.conf`). Also firewall
`udp/5060` to your LAN + trunk IPs — don't leave it open to the internet.

## 9. SIP TLS + SRTP (P2 — for desk phones + trunk over untrusted links)
Browser softphones are already DTLS-SRTP (`webrtc=yes`). For desk phones/trunk signaling, enable the
commented `transport-tls` / `transport-wss` blocks in `asterisk/etc/pjsip.conf` (provide a cert),
set the trunk/extension `transport` accordingly, and turn on `media_encryption=sdes` (or `dtls`) on
those endpoints. Intra-LAN plaintext is acceptable on a trusted switched LAN; TLS is required the
moment SIP/media crosses anything untrusted.

## 10. Lock down ARI/HTTP + go inbound-free (P2)
- `asterisk/etc/http.conf`: `bindaddr=127.0.0.1` (co-located control plane) + TLS block for the
  admin app if it's reachable off-box.
- `asterisk/etc/ari.conf`: real password (step 4), `allowed_origins` = the app origin (not `*`).
- Switch to the **outbound-WebSocket** ARI model (`ari.conf` outbound block) so Asterisk dials out
  to the daemon and nothing ARI is exposed inbound.

---

### Quick go-live checklist
- [ ] `install-control-plane.sh` run; all 4 services + 2 timers enabled and green
- [ ] `pbx.env` filled (DB, ARI pw, SMTP, ALERT_EMAIL, SEED/AUTH/CRED secrets, E911 token)
- [ ] backup timer fired once + a test restore succeeded
- [ ] health alert verified (stop `pbx-ari` → email arrives) + external uptime check on `/api/health`
- [ ] fail2ban `asterisk` jail active; `udp/5060` firewalled to LAN/trunk
- [ ] E911: `e911-notify.env` set; a simulated 911 writes an `E911_CALL` audit row + emails safety
- [ ] (with PSTN) `telnyx-emergency` endpoint + per-device `DEVICE_CALLBACK` provisioned
- [ ] seed/demo passwords rotated; ARI `CHANGEME` replaced

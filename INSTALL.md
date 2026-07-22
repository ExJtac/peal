# Install Guide

How to stand up this PBX from a fresh clone. Three ways in:

- **[Path 0 — One-command install](#path-0--one-command-install-recommended)** *(recommended)* — one
  command on a fresh **Debian 13** host stands up the whole stack, hardened. Works for a VM or a cloud
  server; it just automates Path A.
- **[Path A — Cloud server](#path-a--cloud-server-production)** — the same steps by hand on a Debian box
  with a **public IP** (or on Debian 12 / Ubuntu). Best when you want to see/customize each step.
- **[Path B — Local Debian VM](#path-b--local-debian-vm-testing)** — a Debian virtual machine on your
  own computer for testing/evaluation. It's behind NAT, which limits outside calling (see the caveats).

Both run the **same software**; only the networking and hardening differ. Before either, read
[Prerequisites](#prerequisites) and [Publish to GitHub first](#publish-to-github-first).

> **Terminology & house rules that trip people up**
> - The web console runs on **port 3001** (not 3000). `curl http://localhost:3001/api/health`.
> - **One Postgres database, two owners:** our app tables live in schema `public` (managed by Prisma);
>   Asterisk's realtime tables live in schema `asterisk` (raw SQL). **Prisma must never touch `asterisk`.**
> - Run **exactly one** `ari` process and **one** `worker` process. Under systemd (Path A) this is handled.
> - **911 is native-first** in the dialplan and never depends on the control-plane software.

---

## Architecture in one picture

```
             ┌─────────────────────── one server (or VM) ───────────────────────┐
  desk       │  Asterisk 22  ── ARI ──►  Node control plane (Next.js + daemons)  │
  phones ───►│  (SIP/media engine)        • web console + user portal  :3001     │
  softphones │        │                    • ari daemon   • jobs worker • pnp     │
  SIP trunk ─►│        └──── realtime ──►  PostgreSQL (schemas public + asterisk) │
             └───────────────────────────────────────────────────────────────────┘
```

Asterisk is the thin call engine; every call is handed to our Node code, which does all the routing,
IVR, queues, and AI. Full design is in `BUILD-PLAN.md`; navigation in `CODEMAP.md`.

---

## Path 0 — One-command install (recommended)

On a **fresh Debian 13** host (VM, cloud instance, or bare metal), one command installs everything —
Node.js, PostgreSQL, Asterisk 22, the control plane, the database, all secrets, and a hardened SIP edge
(nftables firewall + fail2ban). There is **no separate SBC**: Asterisk itself is the session border for a
≤25-phone single-tenant box (it terminates every call as a B2BUA).

```bash
curl -fsSL https://raw.githubusercontent.com/ExJtac/peal/main/install.sh \
  | sudo REPO_URL=https://github.com/ExJtac/peal.git bash
```

The identical one-liner also works as **cloud-init** user-data:

```yaml
#cloud-config
runcmd:
  - [ bash, -c, "curl -fsSL https://raw.githubusercontent.com/ExJtac/peal/main/install.sh | REPO_URL=https://github.com/ExJtac/peal.git bash" ]
```

**What it does** (every phase is idempotent — safe to re-run): installs Node ≥20 + PostgreSQL and creates
the `pbx` role/database; builds Asterisk 22; co-locates the shipped configs on `127.0.0.1`, selects the
right PostgreSQL ODBC driver for the CPU arch, and detects the LAN IP; **generates all secrets once and
fans `ARI_PASSWORD`/`AMI_PASSWORD` into `ari.conf`/`manager.conf` so they match** (the classic manual
footgun); runs `npm run setup` (migrate + seed + Asterisk SQL); installs the systemd services; and applies
the nftables firewall + fail2ban jail. It finishes by printing the console URL and the one-time admin
password.

**When it's done:** browse **http://&lt;host&gt;:3001**, log in as `admin@pbx.local` with the password it
printed, and **change it immediately**. To go live with a phone line, follow `TRUNK-SETUP.md` and open the
trunk's signaling IPs in the firewall:

```bash
nft add element inet pbx trunk_ips { <TRUNK_IP> }
```

> **Env knobs:** `PBX_DIR` (default `/opt/pbx`), `PBX_USER` (default `pbx`), `REPO_BRANCH` (default `main`),
> `REPO_URL`. Prefer to run each step yourself, or install on Debian 12 / Ubuntu? Use **Path A** below —
> Path 0 is just that sequence, automated, plus secret fan-out and the firewall.

### Processes & ports (for firewall planning)

| Process | Command | Port(s) |
|---|---|---|
| Web console + user portal (Next.js) | `pbx-web` / `npm run dev` | **3001** (tcp) |
| ARI call-control daemon (exactly one) | `pbx-ari` / `npm run ari` | connects out to Asterisk **8088** |
| Async-AI job worker (exactly one) | `pbx-worker` / `npm run worker` | — (database only) |
| SIP-PnP zero-touch provisioning (optional) | `pbx-pnp` / `npm run pnp` | **5060/udp** multicast |
| Asterisk engine | `asterisk.service` | **8088** ARI/HTTP + WebRTC, **5060** SIP, **10000–20000/udp** RTP, **5038** AMI |
| PostgreSQL | `postgresql` | **5432** |

---

## Prerequisites

- **Debian 12/13** (or Ubuntu equivalent), root/sudo access.
- **Node.js ≥ 20** on `PATH`.
- **PostgreSQL** (server + `pg_dump`/`pg_restore`).
- Build toolchain + libraries for Asterisk 22 (installed by the build script — see Path A step 3).
- A phone-line provider account **only if** you want real outside calls (see `TRUNK-SETUP.md`).

---

## Publish to GitHub first

The project is a git repo but has **no remote yet**. To install "from GitHub", push it once:

```bash
cd /path/to/pbx
git status                       # confirm a clean tree
grep -nE '^\.env' .gitignore     # confirm .env / .env.* are ignored (only .env.example ships)
npm run check:secrets            # fails loudly on weak/unset secrets before anything leaves your laptop

gh repo create <your-org>/pbx --private --source=. --remote=origin --push
# …or, without the gh CLI:
#   git remote add origin git@github.com:<your-org>/pbx.git
#   git push -u origin main
```

Your real secrets stay local — `.env` is gitignored; only `.env.example` (the template) is committed.
Everywhere below, replace `https://github.com/<your-org>/pbx.git` with your actual URL.

---

## Path A — Cloud server (production)

A single Debian host with a static public IP running Asterisk + Node + Postgres together.

### 1. OS packages (as root)
```bash
apt update
apt install -y postgresql nodejs npm git curl fail2ban   # Node must be ≥20; use NodeSource if apt's is older
```
The Asterisk build deps are installed by the script in step 3, but for reference it needs:
`build-essential git wget curl ca-certificates libedit-dev libjansson-dev libsqlite3-dev libxml2-dev
uuid-dev libssl-dev unixodbc unixodbc-dev odbc-postgresql libsrtp2-dev pkg-config`.

### 2. PostgreSQL
```bash
sudo -u postgres createuser pbx            # app role
sudo -u postgres createdb -O pbx pbx       # database named "pbx"
```
Co-located here, Postgres stays on `127.0.0.1` — no cross-host `pg_hba.conf` opening needed.
(`HARDENING.md` §6 suggests giving the `asterisk` schema a separate owner the migrate role can't drop.)

### 3. Build Asterisk 22 from source
Debian's packaged Asterisk is too old (v20); we pin **22.10.0** for PJSIP-realtime + ARI + the modules
this project needs. The repo scripts the whole build so dev == prod:
```bash
git clone https://github.com/<your-org>/pbx.git /opt/pbx
cd /opt/pbx
sudo REPO_DIR=/opt/pbx bash asterisk/build/build-asterisk.sh
```
This installs the build deps, compiles Asterisk with the exact module set (ARI, Stasis, PJSIP incl.
`res_pjsip_notify`, ODBC realtime, `cdr_pgsql`/`cel_pgsql`, voicemail/MOH, SRTP, AudioSocket), creates
the `asterisk` user and directories, copies `asterisk/etc/*` → `/etc/asterisk` and the ODBC files to
`/etc`, and writes an `asterisk.service` systemd unit. It does **not** run `make samples` (we ship configs).

### 4. Per-host Asterisk config edits (as root)
The shipped configs contain placeholders. On a co-located box:
```bash
# Database host: on this box it's local
sed -i 's/MAC_HOST_IP/127.0.0.1/g' /etc/odbc.ini /etc/asterisk/cdr_pgsql.conf /etc/asterisk/cel_pgsql.conf
# Passwords (must match your .env — see step 6): set the ARI + AMI passwords
sed -i 's/CHANGEME_ARI_PASSWORD/<your ARI_PASSWORD>/' /etc/asterisk/ari.conf
sed -i 's/CHANGEME_AMI_PASSWORD/<your AMI_PASSWORD>/' /etc/asterisk/manager.conf
```
**amd64 gotcha:** the ODBC driver path in `/etc/odbcinst.ini` ships defaulting to the **aarch64** library.
On an Intel/amd64 box, switch it to the x86_64 path (confirm with `dpkg -L odbc-postgresql | grep psqlodbcw.so`).

### 5. Apply the Asterisk realtime schema
```bash
psql -d pbx -f /opt/pbx/asterisk/sql/001_ps_tables.sql
psql -d pbx -f /opt/pbx/asterisk/sql/002_cdr_cel.sql
psql -d pbx -f /opt/pbx/asterisk/sql/003_webrtc.sql
```
*(Or let `npm run setup` in step 7 do this from the Node side — it runs every `asterisk/sql/*.sql`.)*

### 6. App environment
```bash
cd /opt/pbx
cp .env.example .env
npm run gen:secrets        # prints strong values — paste them into .env (never commits)
$EDITOR .env
```
Set at least:
- `DATABASE_URL=postgresql://pbx@127.0.0.1:5432/pbx?schema=public`
- `AUTH_SECRET`, `CRED_SECRET`, `PROVISION_SECRET` (from `gen:secrets`)
- `ARI_HTTP_URL=http://127.0.0.1:8088`, `ARI_USER`, `ARI_PASSWORD` *(match `ari.conf`)*
- `AMI_PASSWORD` *(match `manager.conf`)*, `SIP_SERVER_HOST=<public IP or hostname>`, `MEDIA_HOST=127.0.0.1`
- `SEED_PASSWORD` (so the starter logins aren't the shared demo password)
- Leave `ALLOW_MOCK` **empty** in production. AI/STT/TTS/SMTP keys are optional (blank → free mock/log mode).

The full annotated list of variables is in `.env.example`.

### 7. Install app dependencies, database, and build
```bash
npm ci                     # runs `prisma generate` automatically
npm run setup              # migrate deploy + seed (admin/company/example phone) + apply asterisk SQL
npm run build              # production build — the green gate
```

### 8. Start the engine and the control plane
```bash
systemctl start asterisk                       # (enabled by the build script)
sudo NODE_BIN=$(which node) PBX_DIR=/opt/pbx bash asterisk/build/install-control-plane.sh
$EDITOR /etc/pbx/pbx.env                        # the systemd EnvironmentFile (seeded from your .env)
systemctl start pbx-ari pbx-worker pbx-pnp pbx-web pbx-backup.timer pbx-health.timer
```
The systemd units set `Restart=always` and `KillMode=control-group`, which is what makes the
"run exactly one" rule automatic — a restart never orphans a daemon.

### 9. Verify — see [Verifying the install](#verifying-the-install).

### 10. Harden + go live
- **Security** — follow `HARDENING.md` (firewall to LAN + trunk IPs only, keep `8088`/`5038`/Postgres on
  loopback, SIP TLS + SRTP with a real cert, fail2ban, backups + a test restore, health monitor). Run
  `npm run check:secrets` before exposure.
- **Outside calling** — connect a trunk and DIDs per `TRUNK-SETUP.md`, then `npm run smoke:pstn`.

---

## Path B — Local Debian VM (testing)

For evaluating the system on your laptop. Two flavors:

### B1. Self-contained Debian VM (all-in-one)
Create a Debian 12/13 VM in any hypervisor (VirtualBox, UTM, Proxmox, Multipass) with ~2 vCPU / 4 GB RAM,
then follow **Path A steps 1–9 exactly** inside the VM. Everything (Asterisk + Node + Postgres) runs in
the one VM; use the VM's private LAN IP for `SIP_SERVER_HOST`. This is the closest match to production.

**NAT caveats for testing:**
- If the VM is behind NAT, **use a credential (REGISTER-mode) trunk** — the outbound registration punches
  a NAT hole that inbound calls return through. IP-auth trunks can't be reached behind NAT. See `TRUNK-SETUP.md`.
- To register **real desk phones**, give the VM a real LAN IP with **bridged** networking (not NAT).

### B2. Fastest dev path — Lima on a Mac (Asterisk in a VM, Node on the host)
This is the repo's built-in developer setup: Asterisk runs in a scripted **Lima** Debian VM while the Node
control plane runs natively on the Mac.
```bash
brew install lima socket_vmnet
createdb pbx                               # local Postgres (superuser "james" in the sample .env)
cd /path/to/pbx
cp .env.example .env                       # dev defaults are fine to start
limactl start asterisk/lima/pbx.yaml       # builds Asterisk 22 in the VM (first boot takes a while)
# finish the one-time VM steps printed by Lima (set MAC_HOST_IP + ARI/AMI passwords, start Asterisk)
npm install && npm run setup               # migrate + seed + asterisk SQL
# then, in separate terminals:
npm run dev        # web console + portal → http://localhost:3001
npm run ari        # call-control daemon (exactly one)
npm run worker     # async-AI jobs (exactly one)
npm run pnp        # optional: LAN zero-touch provisioning
```
`asterisk/lima/pbx.yaml` forwards ARI (`8088`) and AMI (`5038`) to the Mac; SIP/RTP are intentionally not
forwarded (switch Lima to bridged for real phones). `CLAUDE.md` and `NEXT-STEPS.md` have the day-to-day notes.

---

## Verifying the install

**Asterisk side** (`asterisk -rx "<cmd>"` or inside `asterisk -r`):
```
odbc show               # the asterisk-pg DSN should be connected
pjsip show endpoints    # your extensions appear (read live from the DB)
ari show apps           # "pbx-app" should be registered once the ari daemon is up
```
**Control-plane side:**
```bash
curl http://localhost:3001/api/health     # expect ariConnected: true
```
Then open `http://<host>:3001`, log in as `admin@pbx.local`, and confirm **Phones** shows the seeded
example (a Fanvil X4U on extension 1001) and **Settings**/**Business hours** show timezone dropdowns.

---

## Troubleshooting

- **Health shows `ariConnected: false`** — the `ari` daemon can't reach Asterisk. Check `ARI_HTTP_URL`,
  the `ARI_USER`/`ARI_PASSWORD` match `ari.conf`, and that `asterisk.service` is running.
- **`res_pjsip` won't load / ODBC errors** — the `odbc.ini` DSN keeps `standard_conforming_strings=off`
  (removing it crashes PJSIP on load). On amd64, confirm the driver path in `odbcinst.ini` (see Path A step 4).
- **Web app 404/redirects to `:3000`** — the app listens on **3001**; some internal defaults reference 3000.
  Use 3001.
- **One-way audio / no inbound PSTN behind NAT** — expected on a NAT'd VM. Use a REGISTER trunk, or move to
  bridged networking / a public host. Details in `TRUNK-SETUP.md`.
- **Two ari/worker instances fighting** — `pkill -f worker/ari` (or `worker/jobs`) and start exactly one.
  Under systemd this can't happen.

---

*Once installed, hand users the plain-language **`USER-GUIDE.md`**. Production security checklist:
**`HARDENING.md`**. Connecting the phone company: **`TRUNK-SETUP.md`**.*

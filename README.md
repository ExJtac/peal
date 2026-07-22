# pbx — a custom AI-native phone system

An open, self-hosted business phone system (a 3CX replacement for a single small business, ≤25 phones).
It uses **Asterisk 22** as a thin SIP/media engine and puts a full **Node/TypeScript control plane** on
top of it over ARI: desk phones and browser softphones register to it, calls route however you configure
them, voicemail and calls are transcribed and summarized by **Claude**, and an optional **real-time AI
receptionist** answers and routes calls by voice. Bring your own SIP trunk (Telnyx-first); phones
auto-provision (Fanvil-first, plus Yealink/Grandstream).

**Stack:** Asterisk 22 (PJSIP, from source) · Next.js 16 + Server Actions · Prisma 7 / PostgreSQL ·
Node ARI + AMI daemons · Claude (async + real-time), with offline mocks so tests spend nothing.

## Highlights
- Admin console **and** an in-browser WebRTC softphone user portal (hold / blind-transfer / DND).
- Full call routing: extensions, trunks, DIDs, inbound/outbound routes, ring groups, IVR/auto-attendant,
  business hours, voicemail-to-email.
- **Call center:** queues/ACD with a live wallboard, agent login/pause, conferencing, call parking.
- **AI:** call recording → transcript + summary; a live AI receptionist (VAD → STT → Claude → TTS, barge-in).
- Multi-vendor **phone auto-provisioning** with remote reboot/re-provision.
- Production-ready: systemd supervision, nightly backups, health alerts, login lockout, E911 (Kari's Law),
  fail2ban, toll-fraud guardrails, at-rest secret encryption + rotation.

## Documentation
| Doc | For |
|---|---|
| **[USER-GUIDE.md](USER-GUIDE.md)** | Plain-language guide for admins and staff — how to use every screen. |
| **[INSTALL.md](INSTALL.md)** | Install on a cloud server (public IP) or a local Debian VM. |
| **[TRUNK-SETUP.md](TRUNK-SETUP.md)** | Connect a real phone-line (PSTN) provider. |
| **[HARDENING.md](HARDENING.md)** | Production security / go-live checklist. |
| **[CODEMAP.md](CODEMAP.md)** | Source-of-truth code navigation (every screen, process, and module). |
| **[BUILD-PLAN.md](BUILD-PLAN.md)** | Architecture and design rationale. |

## Quick start (local dev, macOS + Lima)
```bash
brew install lima socket_vmnet
createdb pbx
cp .env.example .env
limactl start asterisk/lima/pbx.yaml     # builds Asterisk 22 in a Debian VM
npm install && npm run setup             # migrate + seed + apply asterisk SQL
npm run dev      # web console + portal → http://localhost:3001
npm run ari      # call-control daemon (exactly one)
npm run worker   # async-AI jobs (exactly one)
```
Full steps (and a cloud-server install) are in **[INSTALL.md](INSTALL.md)**.
Starter login: `admin@pbx.local` / `password123` (change before real use).

> Single-tenant, local-first. Secrets live in a gitignored `.env`; run `npm run check:secrets` before
> exposing an install. Emergency (911) calling is native in the dialplan and never depends on the app.

## License

**Peal** is free, open-source software licensed under the **[GNU Affero General Public License v3.0](LICENSE)**
(`AGPL-3.0-or-later`). You may run, study, modify, and self-host it freely. Under the AGPL, if you
distribute a modified version **or offer it to others over a network as a service**, you must release
your source changes under the same license — which keeps Peal, and everything built on it, free for
everyone.

Copyright © 2026 [ExJtac](https://github.com/ExJtac). Paid installation and support are offered
separately; the software itself is, and stays, free.

# Wiring a real PSTN trunk (bring-your-own SIP)

How to connect this PBX to the public phone network with your own SIP trunk provider, and
actually place + receive real calls. Read the **NAT reality** first — it decides everything else.

> Status: the trunk model, PJSIP realtime sync, outbound + inbound routing, guardrails, DID
> pool, and caller-ID are all built and tested. This doc is the operator runbook for plugging in
> a live provider. Nothing here needs a code change.

---

## TL;DR

- **On the dev VM (Lima `vzNAT`), use a REGISTER (credentials) trunk, not IP-auth.** The VM is
  double-NAT'd to the internet with no port-forward; a registration trunk punches a pinhole so
  inbound calls come back to you. An IP-auth trunk can't be reached from outside and inbound dies.
- **Easiest self-serve, NAT-friendly providers for a home test: Telnyx or VoIP.ms.**
- **Bandwidth is IP-authentication-based and enterprise-onboarded** — a fine *production* choice on
  a publicly-reachable host, but a poor fit for the double-NAT dev VM (see the comparison below).
- Setup is: **provider portal → create trunk in `/trunks` → add DID in `/dids` → inbound route in
  `/inbound` → outbound route in `/outbound` → reload PJSIP in the VM → test.**

---

## The NAT reality (why auth mode matters more than the provider)

SIP trunks authenticate one of two ways:

| | **REGISTER (credentials)** | **IP authentication** |
|---|---|---|
| How | Asterisk registers *out* to the ITSP with a username/password | The ITSP allow-lists your source IP; no login |
| Inbound path | Comes back down the registration's NAT pinhole | ITSP opens a new connection *to your IP* |
| Behind NAT? | ✅ Works — the outbound REGISTER + OPTIONS keepalives hold the pinhole open | ❌ Fails — a double-NAT'd VM has no reachable public IP |
| Best for | **Home / dev VM, most small deployments** | A server with a static, publicly-reachable IP |

Our dev VM runs Lima **`vzNAT`** (`asterisk/lima/pbx.yaml`): VM → Mac → home router → internet.
There is no inbound reachability, so **inbound PSTN only works with a REGISTER trunk** here. This
is a property of *the network*, not the provider — pick a provider that supports registration.

**Audio behind NAT:** the trunk endpoint already sets `rtp_symmetric=yes`, `force_rport=yes`,
`rewrite_contact=yes` (see `psSchema.ts`), so Asterisk latches media to wherever the RTP actually
comes from. Combined with the AOR `qualify_frequency=30` OPTIONS keepalive (kept under a home
router's ~30-45s UDP NAT timeout), two-way audio works over the registration pinhole **without**
setting `external_media_address` in most home setups. If you get one-way audio, see
"Troubleshooting" below.

**Inbound matching is automatic:** the registration row sets `line=yes` + `endpoint=<trunk>`, so
inbound INVITEs arriving down the pinhole bind to your trunk endpoint even when there's no
IP-identify row (the case for VoIP.ms/generic REGISTER trunks). You don't configure this — it's
written by `psSchema.registrationRowForTrunk`.

---

## Provider comparison (for a home / dev PSTN test)

| Provider | Auth | Registration? | Self-serve signup + DID | NAT-friendly | Notes |
|---|---|---|---|---|---|
| **Telnyx** | Credentials **or** IP | ✅ Yes | ✅ Instant + test credit | ✅ | Best all-round; Credentials connection = NAT-friendly. `sip.telnyx.com`. |
| **VoIP.ms** | Credentials | ✅ Yes | ✅ Instant (funding first) | ✅ | Cheapest; register to a POP (e.g. `chicago.voip.ms`). |
| **Twilio** | Credentials (out) / URI push (in) | ⚠️ Outbound only | ✅ Instant | ⚠️ **outbound-only** | Elastic SIP Trunking; termination `<trunk>.pstn.twilio.com`. **Inbound is a push to a public URI — no pinhole, so it can't reach the NAT'd VM.** |
| **Bandwidth** | **IP allow-list** | ❌ (IP-auth) | ⚠️ Sales / credit-approved | ❌ on dev VM | Enterprise/wholesale; great on a public host, not the NAT'd VM. |

> Also **IP-auth-only (avoid on the dev VM):** Skyetel — same NAT problem as Bandwidth. Any
> **REGISTER-capable** BYO ITSP (Flowroute, Callcentric, Sipgate) works via the Generic template.

> The `/trunks` form pre-fills each provider's documented SIP settings when you pick it
> (`src/features/trunks/provider-templates.ts`). You still supply your own credentials.

**Recommendation for the first live test:** **Telnyx** (instant signup, register-capable, one
portal) or **VoIP.ms** (cheapest). If you specifically want **Bandwidth**, do that test on a
**publicly-reachable host** (a cloud VM, or the office deployment with bridged networking + a
port-forward), not the double-NAT dev VM.

---

## Step-by-step: go live

### 1. In your provider portal
1. Create a **SIP trunk / SIP Connection** using **credentials/registration** auth (not IP).
2. Note the **SIP server/registrar hostname**, and set a **SIP username + password**.
3. Buy a **phone number (DID)** and point its inbound/voice route at that SIP connection.
4. Enable **outbound calling** (a voice/messaging profile or outbound permission) and set the
   allowed destinations (at least your own country).

### 2. In this app (`/trunks`)
1. Open **Trunks → Add trunk**, pick your **Provider** (fields pre-fill).
2. Auth mode **Register**, fill **SIP server**, **Username**, **Password**. Leave **Auth IPs** empty.
3. Check **Register enabled** + **Enabled**, create it.

### 3. Add the number + routing
- **`/dids`** — add your DID (E.164, e.g. `+15125551234`) and attach it to the trunk.
- **`/inbound`** — inbound route: DID → a destination (an **extension**, an **IVR/auto-attendant**,
  or the **AI receptionist**). Optionally gate by **business hours**.
- **`/outbound`** — outbound route: a match pattern (e.g. `_1NXXNXXXXXX` / `_X.`), the **trunk**,
  and a **caller-ID number** = your DID (carriers reject calls whose caller-ID isn't a number you
  own). Set the **permission tag** to what your extensions are allowed to dial.

### 4. Reload the engine (registration/identify changes need a PJSIP reload)
Endpoint/auth/AOR are read live, but **registrations + IP-identify require a reload**:
```bash
limactl shell pbx -- asterisk -rx "module reload res_pjsip.so"
limactl shell pbx -- asterisk -rx "pjsip show registrations"   # expect: Registered
```
(Or hit **Reconcile** in the UI, then run the reload — see `reconcile.ts`.)

---

## Test it

### Outbound (PBX → PSTN)
```bash
npm run smoke:pstn -- +1YOURCELL            # first enabled trunk
npm run smoke:pstn -- +1YOURCELL telnyx     # a named trunk
```
Your phone should ring; on answer you hear the demo message. The script watches the channel state
(Ringing → Up) and prints a clear pass/fail. It also works from a real softphone: register a
softphone as an extension and dial the number.

### Inbound (PSTN → PBX)
Call your DID from any phone. It should ring the destination you set in `/inbound`. Watch the
`npm run ari` logs and `/reporting` for the call. On a REGISTER trunk this works with **no**
port-forward.

---

## Troubleshooting

- **Won't register:** wrong username/host, or the provider expects the auth username to differ from
  the SIP user. `pjsip set logger on` in the VM to watch the REGISTER/401 exchange.
- **Outbound rejected (403/404):** caller-ID isn't a DID you own, or the number format is wrong —
  use the outbound route's strip/prepend to match what the carrier expects (usually E.164).
- **Inbound never arrives:** you're on an **IP-auth** trunk behind NAT (switch to REGISTER), or the
  provider is sending the DID in a format `findDid` doesn't match — check `/dids` stores E.164.
- **One-way / no audio:** NAT media. First confirm `rtp_symmetric`/`force_rport`/`rewrite_contact`
  are on the trunk endpoint (they are by default). If still one-way, set on `[transport-udp]` in
  `asterisk/etc/pjsip.conf`: `external_media_address` + `external_signaling_address` = your public
  IP, and `local_net` for your LAN — then forward the RTP range on your router. Simpler: switch the
  VM to **bridged** networking (`pbx.yaml`) so it isn't double-NAT'd.

---

## Production hardening (before real traffic)

- **TLS + SRTP:** uncomment `[transport-tls]` in `pjsip.conf` (+ cert), set the trunk transport to
  **TLS**; the config now honors it (endpoint/AOR/registration use `transport-tls` + `sips:`).
- **fail2ban** on the Asterisk security log; strict **IP-identify ACLs** if you use IP-auth.
- **Guardrails** (`/guardrails`): keep international **off** by default, set concurrency + per-trunk
  spend caps; strong per-extension secrets.
- **911:** native-first in the dialplan (`[emergency]`) — provision `telnyx-emergency` (or your
  carrier's emergency route) as an endpoint and set each device's dispatchable callback. See
  `/e911`.

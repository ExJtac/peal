# User Guide

A plain-language guide to running your phone system. No prior phone-system experience needed.
If a word is unfamiliar, check the **Glossary** at the bottom.

> This system replaces a traditional business phone system (like 3CX). It runs *your own* phone
> service on a small server: desk phones and computer/mobile softphones register to it, calls route
> the way you set them up, voicemail and recordings are transcribed and summarized by AI, and an
> optional **AI receptionist** can answer and route calls by voice.

---

## 1. The two ways in

There are two separate web logins, depending on who you are:

| Who | Where they go | What they can do |
|---|---|---|
| **Admin / office manager** | The **admin console** | Set up everything: phones, extensions, call routing, business hours, voicemail, reports, users. |
| **Everyday staff member** | The **user portal** (`/portal`) | Make and take calls in the browser, see their call history and voicemail, set Do-Not-Disturb. |

**Web address.** In everyday use you'll open the address your installer gave you (for example
`https://pbx.yourcompany.com`). On a development laptop it's `http://localhost:3001`.

**Starter logins** (created when the system is first set up — change these before real use):

| Login | Role | Password |
|---|---|---|
| `admin@pbx.local` | Admin | `password123` *(or whatever `SEED_PASSWORD` was set to)* |
| `manager@pbx.local` | Manager | same |
| `user@pbx.local` | User (extension 2001, a browser phone) | same |

**Roles**, from most to least access:
- **Admin** — everything, including the **Users** screen (creating logins and setting roles).
- **Manager** — all the day-to-day setup (phones, routing, hours, voicemail, reports) except managing logins.
- **User** — only the personal portal (their own phone, calls, and voicemail).

---

## 2. A tour of the admin console

Each screen below is one item in the left-hand menu. You rarely need all of them — the ones most
people touch are **Phones**, **Extensions**, **Business hours**, **Voicemail**, and **Reporting**.

- **Dashboard** — the home screen. Shows whether the phone engine is running, how many calls are
  live right now, totals, and the most recent calls. Glance here to confirm the system is healthy.
- **Extensions** — the internal phone numbers (like 1001, 1002). One extension per person or per
  desk. This is where you create the identity a phone or softphone logs in as.
- **Phones** *(Provisioning)* — the physical desk phones and how they auto-configure themselves.
  You add a phone by its **MAC address** (printed on the phone), pick its **vendor** and **model**
  from dropdowns, assign it an **extension**, and optionally set its **time zone**. The system then
  hands the phone a ready-made config over its **provisioning URL** — no fiddling with the phone's
  menus. From here you can also open the phone's own web page, reveal its admin password, and
  **reboot / re-provision** it remotely. *(See §3 for the step-by-step.)*
- **Trunks** — your connection to the outside world (the phone-line provider, e.g. Telnyx). One
  trunk usually carries all your outside calls. Setting this up is covered in `TRUNK-SETUP.md`.
- **DIDs** — the actual outside phone numbers you own (your "direct" numbers). Each one gets pointed
  at a destination via an inbound route.
- **Inbound routes** — "when someone calls *this* outside number, send them *there*" (an extension,
  a ring group, an IVR menu, the AI receptionist, voicemail, etc.). Can be gated by business hours.
- **Outbound routes** — the rules for calls *going out*: which numbers are allowed, which trunk they
  use, and what caller ID they show.
- **Ring groups** — ring several extensions at once (or in order) under one number — e.g. "Sales"
  rings three desks. Includes a failover destination if nobody answers.
- **Queues** *(call center)* — hold callers in line and distribute them to a team of agents by a
  strategy you choose (all at once, longest-idle first, fewest-calls first, etc.), with hold music
  and announcements.
- **Wallboard** — a live big-screen view of each queue: who's waiting, longest wait, which agents
  are available/on a call/paused, and today's answered/abandoned/average-wait numbers.
- **Conferences** — named meet-me conference rooms people dial into.
- **IVR** *(auto-attendant / phone menu)* — "Press 1 for Sales, 2 for Support…". You build the menu
  visually: a greeting, then what each key press does.
- **Business hours** — your open/closed schedule. In-hours calls go to one destination, after-hours
  calls to another (e.g. an after-hours voicemail or IVR). Holidays supported. *(See §3.)*
- **Voicemail** — the mailboxes and recent messages. Messages can be transcribed and emailed.
- **AI receptionist** — an AI voice agent that answers a call, talks to the caller, and can transfer
  them or take a message. You give it a persona, a greeting, and rules; it's wired in as a
  destination anywhere you can send a call.
- **E911** — emergency-calling setup: the dispatchable address(es) tied to your phones, plus a
  readiness check. Emergency (911) calling is built to work even if the smart control software is down.
- **Reporting** — the call log. Click any call to see its detail, including the recording, AI
  transcript, and summary (when recording is enabled).
- **Settings** — company-wide options: company name, **time zone** (dropdown), default caller ID,
  SIP domain, external IP, how often phones re-check their config, and whether to record calls.
- **Users** *(Admin only)* — create logins, set each person's role, and link a login to an extension.
- **Guardrails** — anti-toll-fraud limits: block international by default, cap simultaneous outbound
  calls, block specific number patterns, and see what got blocked.

---

## 3. Common tasks, step by step

### Add a desk phone and give it to someone
1. **Extensions →** create an extension for the person (e.g. `1005`, name "Jordan").
2. **Phones → Add device.**
   - **MAC address** — copy it from the sticker on the phone (or its box).
   - **Vendor** — pick the maker (Fanvil, Yealink, Grandstream…). The **Model** list updates to that
     vendor's models; pick yours, or choose **Other…** and type it if it isn't listed.
   - **Assign extension** — choose the extension from step 1.
   - **Timezone** — leave as *"Use company default"* unless this phone is in a different zone.
   - **Add device.**
3. Plug the phone into your network. If auto-provisioning is on, it configures itself within a minute.
   Otherwise, in the phone's own web page, set its provisioning/config URL to the **Provisioning URL**
   shown in the Phones table. The phone reboots and comes up logged in as that extension.
4. To push a change immediately, use **Reboot** / **Force provision** next to the phone.

> A ready-made **example phone** (a Fanvil X4U on extension 1001) is already in the Phones list after
> setup, so you can see exactly what a configured phone looks like.

### Set your open/closed hours
1. **Business hours → Add business hours.**
2. Name it (e.g. "Main office"), pick the **Timezone** from the dropdown, tick the **open days**, and
   set the **open** and **close** times. Add any **holidays** (dates it should count as closed).
3. **In-hours destination** — choose the *type* (Extension, Ring group, Queue, IVR, AI receptionist,
   Voicemail…) and the specific target. This is where calls go during business hours.
4. **After-hours destination** — same idea, for when you're closed (often voicemail or an after-hours IVR).
5. Save, then attach this schedule to an **inbound route** so incoming outside calls obey it.

### Send voicemail to email
1. **Extensions** — make sure the extension has an email address on its mailbox.
2. **Voicemail** — turn on transcription if you want the message text (not just the audio) emailed.
3. Leave a test message; the recording (and transcript, if on) arrive by email.

### Build a phone menu (auto-attendant)
1. **IVR → create a flow.** Record or type a greeting ("Thanks for calling…").
2. Add **key options**: 1 → Sales (ring group), 2 → Support (queue), 0 → receptionist, etc. Each
   option points at a destination just like everywhere else.
3. Point an **inbound route** (or a business-hours destination) at this IVR.

### Turn on the AI receptionist
1. **AI receptionist → create an agent.** Give it a name, a **greeting**, a short **persona/instructions**
   ("You're the receptionist for Acme; be brief and friendly"), and its transfer / voicemail / fallback rules.
2. Point an **inbound route**, **IVR option**, or **business-hours** destination at the agent.
3. Call in and talk to it. It listens, replies by voice, and can transfer or take a message.

### Set up a call queue (small call center)
1. **Queues → create a queue.** Choose the ring strategy, hold music, wait limits, and the failover
   destination for callers who wait too long.
2. Add **agents** (extensions) as members.
3. Agents log in / pause from their **portal**; watch it live on the **Wallboard**.

### Make a test call
- **Internal:** from one extension dial another (e.g. 1001 → 1002).
- **In the browser:** log into the **portal** as the `user@pbx.local` extension and call another extension.
- **Outside:** requires a working trunk — see `TRUNK-SETUP.md`.

---

## 4. The user portal (for everyday staff)

Open `/portal` and log in. Staff can:
- **Make and take calls right in the browser** (a built-in softphone — no app to install). Hold,
  resume, and blind-transfer are supported.
- See their **call history** and listen to their **voicemail**.
- Toggle **Do-Not-Disturb** so their phone stops ringing.
- If they're a queue agent: **log in / pause** for the queue.

---

## 5. Connecting to the outside world

Internal calling and the browser softphone work on their own. To call and receive **real outside
phone numbers**, you connect a **SIP trunk** (a phone-line account from a provider such as Telnyx or
VoIP.ms) and add your **DID** numbers. That setup — including provider choice and the networking
details — is documented separately in **`TRUNK-SETUP.md`**.

---

## 6. Day-to-day upkeep

- **Reboot / re-provision a phone** — from **Phones**, without walking to the desk.
- **Recordings & transcripts** — appear on each call in **Reporting** (when call recording is enabled
  in **Settings**). Note the consent warning there: recording laws vary by location.
- **Backups** — the server backs up the database automatically each night (your installer sets this up).
- **Emergency calls** — 911 is handled directly by the phone engine and does not depend on the smart
  routing software, so it keeps working even during an outage. Keep each phone's **E911** address current.

---

## 7. Glossary

- **Extension** — an internal number (1001, 1002…) that a phone or softphone logs in as.
- **Softphone** — a phone that runs as software (in the browser or an app) instead of a physical desk set.
- **Provisioning** — the phone automatically downloading its settings from the system, so you don't
  program it by hand.
- **MAC address** — a phone's unique hardware ID (12 hex characters, on a sticker). Used to match a
  phone to its config.
- **Trunk** — the account/connection to an outside phone-line provider that carries calls to/from the
  public phone network.
- **DID** — a "Direct Inward Dialing" number: an actual outside phone number you own.
- **Inbound / Outbound route** — the rules for where incoming calls go and how outgoing calls leave.
- **Ring group** — one number that rings several extensions together or in sequence.
- **Queue (ACD)** — holds callers in line and hands them to available agents by a chosen strategy.
- **IVR / auto-attendant** — the "press 1 for…" menu that greets and routes callers.
- **SIP** — the standard internet protocol phones use to set up calls.
- **Caller ID** — the name/number shown to the person you're calling.

---

*Setting the system up on a server? See **`INSTALL.md`**. Navigating the code? See **`CODEMAP.md`**.*

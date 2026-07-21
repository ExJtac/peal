# Today's Plan (2026-07-21)

Constraint: MacBook has no Ethernet + the Fanvil is PoE + the Mac isn't on the office network,
so **browser-based calling** is the path to test today (physical Fanvil = home test tonight).

Agreed scope (in priority order):
1. **Users, roles & permissions** — roles Admin / Manager / User; Users admin screen; login
   routes by role (Admin/Manager → console, User → portal).
2. **User portal + in-browser calling (headline)** — `/portal` with a WebRTC softphone (SIP.js
   over WSS to Asterisk), call history, voicemail w/ AI summaries, DND/forward toggles. Adds an
   Asterisk WSS transport + WebRTC-enabled endpoints.
3. **Enable local testing today** — switch the Lima VM to bridged networking + wire the VM↔Mac
   Postgres ODBC hop, so a browser softphone registers + places a real call on the Mac today
   (same setup lets the Fanvil register at home tonight).
4. **Complete the admin surface** — voicemail management, IVR/auto-attendant builder,
   business-hours/time-conditions, extension + ring-group edit pages.

Deferred (chosen not-today): call-center (queues/recording/conferencing/parking/BLF), deeper AI
wiring, SIP/toll-fraud hardening polish.

Working agreement: green before each commit (`npm run build` + `npm test`); commit checkpoints
along the way; commit everything before `/clear`.

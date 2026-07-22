# CODEMAP — pbx (Custom AI-PBX)

Source of truth for navigation. When a feature is added/moved/removed, update this in the
same step. Consult this FIRST, then open only the mapped file(s).

> ✅ **Phase 1 + user portal + in-browser calling + real-time AI receptionist built & verified live.**
> `npm run build` + `npm test` green (84 tests). Roles (Admin/Manager/User `src/lib/roles.ts`),
> Users admin, WebRTC softphone portal, business hours, voicemail admin, IVR builder all live;
> Asterisk realtime ODBC + `transport-ws` WebRTC verified running in the VM.
> **Real-time AI voice agent** (flagship): a call routed to an `AI_AGENT` destination is answered by
> Claude over a live externalMedia RTP loop (VAD → streaming STT → Claude tool-use → streaming TTS,
> with barge-in + transfer/voicemail); mock-default (free), verified end-to-end by `scripts/ai-smoke.ts`.
> Trunk/PSTN go-live is **prepped, not yet live** (no ITSP account yet): provider-agnostic trunk
> setup + NAT-correct PJSIP (REGISTER line-support, keepalive tuning, transport-honoring), a live
> outbound-PSTN smoke, and `TRUNK-SETUP.md`. Going live = pick a REGISTER-capable provider
> (Telnyx/VoIP.ms — the dev VM is double-NAT'd, so IP-auth providers like Bandwidth need a public host).
> ✅ **Call-center suite BUILT + live-verified** — queues/ACD + live wallboard + agent login/pause,
> conferencing, call parking, softphone Hold + blind Transfer, internal dialing of feature numbers —
> and **production hardening** — systemd supervision + auto-restart, daily pg backups, health-alert
> email, login lockout, `prisma reset` guard, E911 on-site notify, fail2ban jail (see `HARDENING.md`).
> Deferred/not built: live PSTN traffic (needs an ITSP account), BLF presence state, non-Fanvil
> renderers, attended transfer, SIP TLS/SRTP enablement (config-ready). Tags: `[later]` = not built.

## Long-running processes (`worker/`)
| Process | File | What it does |
|---|---|---|
| `npm run ari` | `worker/ari/index.ts` | ARI call-control daemon — connects to Asterisk events, drives every call, heartbeats SystemStatus |
| `npm run worker` | `worker/jobs/index.ts` | Async-AI job worker — DB-backed claim loop (`lib/queue.ts`) → transcription/summary stages |
| `npm run pnp` | `worker/pnp/index.ts` | SIP-PnP multicast responder (zero-touch provisioning) |

## Engine config (`asterisk/` — checked in, dev==prod, NOT Prisma)
| File | What it does |
|---|---|
| `asterisk/lima/pbx.yaml` | Lima Debian 13 VM (vzNAT dev; bridged office block commented); provision hook runs the build script |
| `asterisk/build/build-asterisk.sh` | Pinned Asterisk 22 (`ASTERISK_VERSION=22.10.0`) source build + menuselect + user/dirs + systemd + copies configs |
| `asterisk/build/install-control-plane.sh` + `asterisk/build/systemd/*` | **PROD supervision** (dev stays manual on the Mac): systemd units for the 3 Node daemons + Next app (`pbx-ari`/`worker`/`pnp`/`web`, `Restart=always`, `KillMode=control-group` reaps tsx orphans) + `pbx-backup.timer` (daily `pg_dump`) + `pbx-health.timer` (health-alert email). Installer renders `@PLACEHOLDERS@` + enables |
| `install.sh` (repo root) | **One-command installer** (Path 0 in `INSTALL.md`): fresh Debian 13 → the whole stack, hardened. curl bootstrap (clone → re-exec) + 11 idempotent phases; orchestrates the sub-scripts below + `build-asterisk.sh` + `install-control-plane.sh` + `secrets:write` + `npm run setup`. Prints console URL + one-time admin pw |
| `asterisk/build/{setup-node,setup-postgres,configure-host,harden-host}.sh` | Installer glue: NodeSource Node ≥20 · Postgres + `pbx` role/db (loopback trust) · co-locate shipped configs on `127.0.0.1` + arch-correct ODBC driver (`dpkg -L`) + `james`→`pbx` + `.env` host/network values · **edge lockdown** = nftables LAN-scoped firewall (SIP/RTP/console to `$LAN_CIDR` + trunk set; 5038/5432 loopback) + fail2ban jail. **No separate SBC** — Asterisk-as-B2BUA is the SBC for ≤25 phones |
| `asterisk/etc/*.conf` | asterisk/modules/http/ari/**manager**/res_odbc/odbc(inst)/extconfig/sorcery/pjsip/**pjsip_notify**/extensions/cdr/cel/logger/rtp/musiconhold |
| `asterisk/etc/manager.conf` + `pjsip_notify.conf` | AMI enabled (ACL-locked `[pbx-ctl]`) + `[resync]`/`[reboot]` check-sync payloads — powers phone reboot / force-provision (`src/telephony/ami.ts`) |
| `asterisk/etc/extensions.conf` | Dialplan: `Stasis(pbx-app)` handoff + **native-first 911** + graceful fallback contexts |
| `asterisk/sql/001_ps_tables.sql` | schema `asterisk` + PJSIP realtime tables (ps_endpoints/auths/aors/contacts/endpoint_id_ips/registrations/domain_aliases/globals) |
| `asterisk/sql/002_cdr_cel.sql` | `asterisk.cdr` + `asterisk.cel` |
| `asterisk/scripts/e911-notify.sh` + `asterisk/security/pbx-asterisk.local` | Kari's Law notify hook (POSTs to /api/e911/notify, fail-soft) + fail2ban SIP jail. Prod runbook: `HARDENING.md` |

## Routes (`src/app/`)
> **Admin list pages are full CRUD.** Each list route (extensions, trunks, dids, inbound, outbound,
> ring-groups, users, e911, business-hours, provisioning) supports **edit-in-place** via a `?edit=<id>`
> URL param: the "Add" form doubles as an edit form (pre-filled, hidden `id`, Cancel), each row has an
> **Edit** link, and the edited row is highlighted (`.row-editing`). Identity fields that key Asterisk
> realtime — extension `number`, trunk `name`, device `mac` — are **read-only in edit mode** (renaming
> would orphan `ps_*` rows). Reference impl: `outbound/page.tsx`.
| Route | File | What it does |
|---|---|---|
| `/` | `app/(admin)/page.tsx` | Dashboard: engine status, active channels, counts, recent calls |
| `/login` | `app/login/page.tsx` | Admin login (JWT cookie) |
| `/extensions` | `app/(admin)/extensions/page.tsx` | Extensions CRUD → writes ps_* |
| `/trunks` | `app/(admin)/trunks/page.tsx` | SIP trunks (Telnyx template) → writes ps_* |
| `/dids` | `app/(admin)/dids/page.tsx` | DID inventory → trunk + inbound route |
| `/inbound` | `app/(admin)/inbound/page.tsx` | Inbound routes (DID → destination) |
| `/outbound` | `app/(admin)/outbound/page.tsx` | Outbound routes + caller-ID + permission |
| `/ring-groups` | `app/(admin)/ring-groups/page.tsx` | Ring groups + members |
| `/queues` | `app/(admin)/queues/page.tsx` | Call queues (ACD): strategy, MOH, ring/wrap/max-wait, announcements, timeout/failover dest, agent members (+penalty) |
| `/queues/wallboard` | `app/(admin)/queues/wallboard/page.tsx` | **Live wallboard** — polls `/api/queues/live` (~3s); per-queue tiles: waiting, longest wait, agents avail/on-call/paused, today answered/abandoned/avg-wait |
| `/conferences` | `app/(admin)/conferences/page.tsx` | Conference rooms CRUD (number, MOH-when-alone, record, max members) |
| `/api/queues/live` | `app/api/queues/live/route.ts` | QueueStatus feed (daemon-written snapshots + queue names), Manager+ (401 JSON otherwise) |
| `/provisioning` | `app/(admin)/provisioning/page.tsx` | Devices (MAC/vendor/model) + per-MAC provisioning URL |
| `/guardrails` | `app/(admin)/guardrails/page.tsx` | Toll-fraud policy (singleton) + block log |
| `/e911` | `app/(admin)/e911/page.tsx` | Dispatchable locations + go-live readiness |
| `/reporting` | `app/(admin)/reporting/page.tsx` (+ `[callId]`) | CDR list + call detail (transcript/AI summary) |
| `/settings` | `app/(admin)/settings/page.tsx` | Company settings (singleton) |
| `/users` | `app/(admin)/users/page.tsx` | User administration (roles, link extension) — ADMIN only |
| `/business-hours` | `app/(admin)/business-hours/page.tsx` | Business hours / time conditions |
| `/voicemail` | `app/(admin)/voicemail/page.tsx` | Voicemail mailboxes + recent messages (admin) |
| `/ivr` | `app/(admin)/ivr/page.tsx` (+ `[id]`) | IVR / auto-attendant builder (flows, nodes, digit options) |
| `/ai-agents` | `app/(admin)/ai-agents/page.tsx` (+ `[id]`) | AI receptionist CRUD (persona, greeting, transfer/voicemail/fallback, VAD tuning) |
| `/portal` | `app/portal/page.tsx` (+ `voicemail/`) | **User portal**: in-browser WebRTC softphone, call history, voicemail, DND |
| `/provision/[mac]` | `app/provision/[mac]/route.ts` | Serve per-MAC phone config (tokened) |
| `/media/recording/[id]` | `app/media/recording/[id]/route.ts` | Stream a call recording via ARI (Admin/Manager) |
| `/media/voicemail/[id]` | `app/media/voicemail/[id]/route.ts` | Stream a voicemail recording via ARI (mailbox owner or Admin/Manager) |
| `/api/health` | `app/api/health/route.ts` | Health JSON (reads SystemStatus) |
| `/api/e911/notify` | `app/api/e911/notify/route.ts` | Kari's Law hook — token-gated POST from `e911-notify.sh`: emails on-site contact + writes an `E911_CALL` audit row |

## Features (`src/features/<feature>/`) — UI + Server Actions
| Feature | Files | Notes |
|---|---|---|
| auth | `auth/actions.ts`, `auth/login-form.tsx` | login/logout (seeded admin) |
| extensions | `extensions/actions.ts` | ext CRUD → `upsertExtensionPjsip` (ps_endpoint/auth/aor) + mailbox |
| trunks | `trunks/actions.ts`, `trunks/provider-templates.ts`, `trunks/trunk-form.tsx` | BYO trunk → `upsertTrunkPjsip` (endpoint/aor/auth/identify/registration). Provider picker + NAT warnings; **`mediaEncryption` NONE/SDES/DTLS → `media_encryption` on the trunk endpoint (SRTP; needs transport=TLS)**; see `TRUNK-SETUP.md` |
| dids · inbound-routes · outbound-routes | `*/actions.ts` | number inventory + routing (read by `telephony/destinations`) |
| ring-groups | `ring-groups/actions.ts` | group + member rebuild |
| queues · conferences | `queues/actions.ts`, `queues/wallboard.tsx`, `conferences/actions.ts` | queue CRUD + member rebuild (number:penalty order); drives `telephony/queue`. **QUEUE wired into every destination picker** (inbound/business-hours/ivr/ring-group-failover/ai-agent handoff). `wallboard.tsx` (client) polls `/api/queues/live` |
| provisioning | `provisioning/actions.ts`, `provisioning/device-form.tsx`, `provisioning/reboot.ts`, `provisioning/device-controls.tsx`, `provisioning/web-access.tsx` | Device CRUD (+ generated **web-admin pw**, `regenerateWebPassword`); provisioning URL from `provisioning/secrets`; **`device-form.tsx`** (client) = Add/Edit form with a **cascading Vendor→Model dropdown** (`PHONE_MODELS`, "Other…" free-text) + **timezone dropdown** (`TIMEZONES`); **reboot / force-provision** push (`reboot.ts` → `telephony/ami`, buttons in `device-controls.tsx`); **phone web-UI link + creds** (`web-access.tsx`) |
| guardrails · e911 · settings | `*/actions.ts` | singletons + E911 locations (reporting is read-only, no actions) |
| users | `users/actions.ts` | ADMIN-only: create/role/link-extension/reset-password |
| business-hours · voicemail · ivr | `*/actions.ts` | time conditions · VM transcribe toggle · IVR flow/node/option CRUD |
| ai-agents | `ai-agents/actions.ts`, `ai-agents/agent-form.tsx` | AI receptionist CRUD (create/update/delete/toggle) + shared form; `AI_AGENT` wired into all destination pickers |
| portal | `portal/actions.ts`, `portal/softphone.tsx` | user portal: SIP.js WebRTC softphone (client, + **Hold/Resume** & **blind Transfer** via SIP REFER → routeInternal) + DND toggle + **queue-agent login/pause** (`setAgentLoggedIn`/`setAgentPaused` → `QueueMember`, read by the ACD engine) |

## Call-control engine (`src/telephony/`) — worker-safe
| File | Responsibility |
|---|---|
| `ariClient.ts` | Thin fetch-based ARI REST wrapper (answer/bridge/originate/play/record/continue/vars/**moh start+stop**/**hold·unhold·redirect·snoop·deviceState**) |
| `ami.ts` | Minimal AMI client (`node:net`) — `pjsipNotify(endpoint, resync\|reboot)` sends a check-sync NOTIFY (phone reboot / force-provision) the ARI API can't; pure `buildAction`/`parseAmiBlocks` helpers |
| `connection.ts` | ARI events WS lifecycle + backoff reconnect + heartbeat (inbound WS; outbound-WS upgrade noted) |
| `stateRecovery.ts` | Re-adopt in-flight channels on reconnect (via CALLREC_ID channel var) |
| `dispatcher.ts` | ARI event router (StasisStart / DTMF / ChannelDestroyed) |
| `routing.ts` | StasisStart pipeline (internal / inbound / outbound / dialed / spine) |
| `destinations.ts` | resolvers: extension (+ **call-forward to mobile** in `dialExtension`), ring-group, **queue**, IVR, voicemail, time-condition + inbound/outbound/internal entry; `routeInternal` resolves **queue + ring-group by number** (internal dial + blind-transfer target); shared `resolveOutboundLeg` (route+guardrails+trunk+CID) used by outbound **and** forwarding |
| `ivrInterpreter.ts` | DB IvrFlow/IvrNode state machine (DTMF-driven, no generated dialplan) |
| `originate.ts` | dial-group primitive (bridge + first-answer-wins ring + failover) |
| `queue.ts` | **call-queue / ACD engine** (stateful): waiting list on MOH + agent-dial scheduler by strategy (RINGALL/LINEAR/FEWEST_CALLS/LEAST_RECENT/RANDOM), answered-bridge, abandon/no-answer/max-wait→failover, hold announcements, `writeQueueSnapshot`→`QueueStatus` (wallboard). Own `pendingAgentDials`/playback maps; mirrors `QUEUE_*` channel vars for recovery. `dialQueue` (from `resolveDestination` QUEUE) + `onAgentAnswered` (routing "queued") + `onQueue*Ended` (dispatcher) |
| `conference.ts` | **meet-me conferencing**: persistent named mixing bridge, MOH-when-alone, optional record, teardown-when-empty; mirrors `CONF_ID`/`CONF_BRIDGE` vars for recovery. `joinConference` (from `resolveDestination` CONFERENCE / dial the number) + `onConferenceChannelGone` (dispatcher) + `recoverConferences` |
| `parking.ts` | **call parking**: dial the orbit (`PARK_ORBIT`, default 7000) to park on MOH in the lowest free slot (announced), dial the slot (7001–7010) to retrieve; return-timeout; mirrors `PARK_*` vars for recovery. `park`/`retrieve` (from `routeInternal`) + `onParkChannelGone` + `recoverParking` |
| `callSession.ts` · `callRecord.ts` · `recording.ts` · `status.ts` · `events.ts` | in-memory registry · CDR create/finalize · **call recording + SUMMARIZE_CALL enqueue** · SystemStatus · typed shapes |
| `voicemail.ts` | **app-owned voicemail capture over ARI** (greeting → record → `VoicemailMessage` row → TRANSCRIBE_VOICEMAIL enqueue → MWI); `RecordingFinished`/caller-hangup once-guard; native `[vmdirect]` fallback. `sendToVoicemail` delegates here |
| `stateRecovery.ts` | on ARI (re)connect: re-adopt in-flight channels + `recoverAgents` (AI legs) + `recoverQueues` + `recoverConferences` (re-adopt held queue callers / conference members via surviving bridge) |
| `realtime/{odbcPool,psSchema,psWriter,reconcile}.ts` | Prisma truth → Asterisk ps_* tables (`asterisk` schema) + reconcile |

## Real-time AI receptionist (`src/telephony/realtime-media/`) — the flagship voice agent
Reached via `resolveDestination(AI_AGENT, agentId, …)`. Live media = ARI **externalMedia** (slin16
RTP/UDP) bridged with the caller. Turn loop: VAD → streaming STT → Claude (tool-use) → streaming TTS,
injected as paced RTP, with barge-in. Mock-default (free); real providers opt-in via env keys.
| File | Responsibility |
|---|---|
| `agentSession.ts` | **Orchestrator** (one per call) + `startAgentSession()`. Turn state machine (CONNECTING_MEDIA→GREETING→LISTENING→THINKING→SPEAKING→CLOSED), barge-in, idempotent teardown (ALWAYS hangs up the externalMedia leg → frees the RTP port), failure/fallback, DTMF, restart hooks. Guards: monotonic `turnId` + `closed`. |
| `rtpTransport.ts` | UDP socket per call; learns the VM's RTP peer from the first packet (symmetric RTP); `unref()`d; `allocateTransport()` picks a free port |
| `rtpPacer.ts` | Self-correcting 20 ms send clock; comfort-silence on underrun; `flush()` = barge-in, `stop()` = teardown |
| `rtp.ts` | RTP parse/build (slin16, little-endian), `toFrames`, `frameEnergy` |
| `vad.ts` | energy VAD + endpointing (`DEFAULT_VAD` for listening, `BARGE_VAD` for barge-in) |
| `agentConfig.ts` · `agentTools.ts` · `agentRegistry.ts` | load AiAgent → runtime config + system prompt · tool schemas (transfer/voicemail/end/answer) · byCaller/byEm registry + `drainAgents()` |

## Provisioning (`src/provisioning/`)
| File | Responsibility |
|---|---|
| `renderer.ts` · `registry.ts` · `context.ts` | `DeviceRenderer` interface (+ `webAdmin`/`provisioningUrl`/`pollHours`/`srtp`) + vendor dispatch + DB-backed config context (decrypts web-admin pw, tokened poll URL) |
| `vendors/fanvil.ts` | Fanvil config (header + SIP account + BLF keys + **web-admin login** + **scheduled-poll repeat** + SRTP-when-set) — golden-tested |
| `secrets.ts` · `sipPnp.ts` · `filename.ts` | per-MAC HMAC token + SIP-PnP parse/response helpers + **`macFromProvisionRequest`** (resolves each vendor's request filename — `<mac>.cfg` / `cfg<mac>.xml` — to the MAC; used by `/provision/[mac]`) |
| `vendors/yealink.ts` · `vendors/grandstream.ts` | Yealink flat-cfg + Grandstream P-value XML renderers (SIP + transport/SRTP + web-admin + poll + fn-keys) — golden-tested; vendor keys flagged for handset verification |
| `vendors/poly.ts` | `[later]` — same interface |
| `models.ts` | curated per-vendor phone-model lists (`PHONE_MODELS`, `modelsForVendor`) backing the cascading Model dropdown. **Cosmetic** — renderers branch on vendor, not model; unlisted models still save via "Other…" |

## Async AI (`src/ai/`) — worker-safe
| File | Responsibility |
|---|---|
| `stages/transcribeVoicemail.ts` · `stages/summarizeCall.ts` | STT → Claude summary → DB. VM stage fetches audio via ARI + **emails the transcript** (`resolveEmail`) to the mailbox owner |
| `providers/email/{emailProvider,mockEmailProvider,smtpEmailProvider,resolve}.ts` | email seam (`resolveEmail`) — mock/log default, real SMTP via nodemailer behind `SMTP_*`/`EMAIL_FROM` |
| `providers/stt/{sttProvider,mockSttProvider,deepgramSttProvider,resolve}.ts` | batch STT seam (mock default, Deepgram) |
| `providers/llm/{llmProvider,mockLlmProvider,anthropicLlmProvider,resolve}.ts` | batch Claude summary seam (mock default) |
| `providers/stt/{streamingSttProvider,mockStreamingStt,deepgramStreamingStt}.ts` | **streaming** STT for the live agent (`resolveStreamingStt`) — mock default, Deepgram live WS |
| `providers/tts/{ttsProvider,mockTts,deepgramAuraTts,elevenLabsTts,resolve}.ts` | **streaming TTS** seam (`resolveTts`) — mock tone default, Deepgram Aura / ElevenLabs (PCM 16k) |
| `providers/llm/{realtimeLlmProvider,mockRealtimeLlm,anthropicRealtimeLlm}.ts` | **conversational brain** (`resolveRealtimeLlm`) — streaming Claude tool-use; mock rule-router default |
| `prompts/callSummary.ts` · `media.ts` | prompts; recording/VM file existence |

## Shared infra (`src/lib/`) — worker-safe
| File | Responsibility |
|---|---|
| `db.ts` · `env.ts` · `queue.ts` · `heartbeat.ts` | Prisma+pg singleton · typed env · AiJob queue · heartbeat wrapper |
| `auth.ts` · `guards.ts` · `password.ts` · `crypto-vault.ts` | JWT session · role guards · bcrypt · AES-256-GCM vault (**multi-key: encrypt=primary `CRED_SECRET`, decrypt tries `CRED_SECRET_OLD` fallbacks; `tryDecryptSecret` + `rotate:cred-secret` for safe rotation**) |
| `phone.ts` · `guardrail.ts` · `businessHours.ts` · `e911.ts` · `ids.ts` · `callForward.ts` · `health.ts` · `loginThrottle.ts` · `net.ts` | dial classify/pattern · toll-fraud engine · time rules · emergency rules · channel/MAC helpers · call-forward parse/serialize · **control-plane health verdict** (pure; drives the health-alert timer) · **XFF→safe host** (phone web-link sanitizer) |
| `timezones.ts` | curated IANA `TIMEZONES` list (+ `isKnownTimezone`) backing **every** timezone dropdown — provisioning (`device-form.tsx`), `settings/page.tsx`, `business-hours/page.tsx`. IANA values (correct for `businessHours` Intl calc + Fanvil passthrough) |
| `src/components/sidebar.tsx` | admin nav (client, active link) |

## Docs (repo root)
| File | Audience / purpose |
|---|---|
| `README.md` | GitHub landing page — pitch, highlights, doc index, dev quick-start |
| `USER-GUIDE.md` | **Plain-language** guide for admins + staff: the two logins/roles, a screen-by-screen tour, step-by-step common tasks, the portal, and a glossary |
| `INSTALL.md` | Install from a fresh clone — **Path 0 one-command install** (`curl … | sudo bash` / cloud-init) + **Cloud server** (public IP, prod, systemd) + **Local Debian VM** (self-contained + Lima quick-start), with a "publish to GitHub first" step; cites HARDENING/TRUNK-SETUP/BUILD-PLAN |
| `HARDENING.md` · `TRUNK-SETUP.md` · `BUILD-PLAN.md` | prod security runbook · PSTN trunk go-live · architecture/design |

## Data + scripts + tests
| File | Responsibility |
|---|---|
| `prisma/schema.prisma` · `prisma/seed.ts` | 28 models (public; +`AiAgent`, +`AI_AGENT` dest, +`AiOutcome`) · seed (admin/company/2 extensions/**example Fanvil X4U phone on ext 1001**/manager+user logins/disabled Telnyx trunk) |
| `scripts/apply-asterisk-sql.ts` | applies `asterisk/sql/*.sql` (Asterisk-owned schema) |
| `scripts/originate-test.ts` | Phase-0 spine check (server calls a phone → plays demo) |
| `scripts/smoke-live.ts` | opt-in live ARI + STT/LLM check |
| `scripts/ai-smoke.ts` | **opt-in live** AI-receptionist end-to-end (routes a real call → agent → verifies media loop + clean teardown) |
| `scripts/pstn-smoke.ts` | **opt-in live** outbound-PSTN check (`npm run smoke:pstn -- +1NUMBER [trunk]`): originates a real call out a trunk, watches Ringing→Up, prints pass/fail + inbound checklist |
| `scripts/queue-smoke.ts` / `conference-smoke.ts` / `parking-smoke.ts` | **opt-in live** ACD check (`npm run smoke:queue`): routes a real call → QUEUE, verifies held-on-MOH-bridge + QueueCallLog + abandon-on-hangup |
| `scripts/ami-smoke.ts` | **opt-in live** AMI check (`npm run smoke:ami -- <ext> resync\|reboot`): login + PJSIPNotify to a phone endpoint |
| `scripts/rotate-cred-secret.ts` | re-encrypt at-rest secrets to a new `CRED_SECRET` (`npm run rotate:cred-secret [-- --dry-run]`) — multi-key, idempotent, reports per-column counts |
| `scripts/gen-secrets.ts` · `scripts/check-secrets.ts` · `scripts/write-secrets.ts` · `scripts/lib/secrets.ts` | `gen:secrets` prints strong secrets (never writes); `check:secrets` audits (FAILs on unset/dev-default/short); **`secrets:write` generate-once + fan-out** — fills `.env` and mirrors `ARI_PASSWORD`/`AMI_PASSWORD` into `ari.conf`/`manager.conf` so they match (idempotent; preserves real values). `lib/secrets.ts` = shared keys/`genSecret`/placeholder helpers (used by all three) |
| `scripts/backup-db.sh` | `pg_dump` of the whole `pbx` DB (BOTH schemas) + retention prune; run by `pbx-backup.timer` or `npm run backup` |
| `scripts/health-check.ts` | control-plane health probe → alert/recovery email via the email seam (marker-deduped); `pbx-health.timer` or `npm run health:check` |
| `scripts/guard-reset.ts` | refuses a prisma reset when schema `asterisk` has tables (footgun guard); `npm run db:reset` runs it first |
| `test/*.test.ts` | phone · guardrail · businessHours · e911 · ids · provisioning (+ **web-auth/SRTP/poll**) · **net (XFF sanitize)** · **psSchema (trunk/ext ps_* rows)** · rtp · vad · rtpPacer · realtimeProviders · agentSession · health · **queue (ACD state machine)** · **ami (AMI framing/parse + socket round-trip)** · **write-secrets (fan-out + idempotency + preserve)** (offline) |

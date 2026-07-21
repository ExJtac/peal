# CODEMAP — pbx (Custom AI-PBX)

Source of truth for navigation. When a feature is added/moved/removed, update this in the
same step. Consult this FIRST, then open only the mapped file(s).

> ✅ **Phase 1 + user portal + in-browser calling built & verified live.** `npm run build` +
> `npm test` green (48 tests). Roles (Admin/Manager/User `src/lib/roles.ts`), Users admin,
> WebRTC softphone portal, business hours, voicemail admin, IVR builder all live; Asterisk
> realtime ODBC + `transport-ws` WebRTC verified running in the VM.
> Not yet built: call-center (queues/recording/conferencing/parking/BLF), non-Fanvil renderers,
> real-time AI voice agent. Tags: `[later]` = not built yet.

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
| `asterisk/etc/*.conf` | asterisk/modules/http/ari/res_odbc/odbc(inst)/extconfig/sorcery/pjsip/extensions/cdr/cel/logger/rtp/musiconhold |
| `asterisk/etc/extensions.conf` | Dialplan: `Stasis(pbx-app)` handoff + **native-first 911** + graceful fallback contexts |
| `asterisk/sql/001_ps_tables.sql` | schema `asterisk` + PJSIP realtime tables (ps_endpoints/auths/aors/contacts/endpoint_id_ips/registrations/domain_aliases/globals) |
| `asterisk/sql/002_cdr_cel.sql` | `asterisk.cdr` + `asterisk.cel` |
| `asterisk/scripts/e911-notify.sh` | Kari's Law on-site notify hook (logs; TODO real paging) |

## Routes (`src/app/`)
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
| `/provisioning` | `app/(admin)/provisioning/page.tsx` | Devices (MAC/vendor/model) + per-MAC provisioning URL |
| `/guardrails` | `app/(admin)/guardrails/page.tsx` | Toll-fraud policy (singleton) + block log |
| `/e911` | `app/(admin)/e911/page.tsx` | Dispatchable locations + go-live readiness |
| `/reporting` | `app/(admin)/reporting/page.tsx` (+ `[callId]`) | CDR list + call detail (transcript/AI summary) |
| `/settings` | `app/(admin)/settings/page.tsx` | Company settings (singleton) |
| `/users` | `app/(admin)/users/page.tsx` | User administration (roles, link extension) — ADMIN only |
| `/business-hours` | `app/(admin)/business-hours/page.tsx` | Business hours / time conditions |
| `/voicemail` | `app/(admin)/voicemail/page.tsx` | Voicemail mailboxes + recent messages (admin) |
| `/ivr` | `app/(admin)/ivr/page.tsx` (+ `[id]`) | IVR / auto-attendant builder (flows, nodes, digit options) |
| `/portal` | `app/portal/page.tsx` (+ `voicemail/`) | **User portal**: in-browser WebRTC softphone, call history, voicemail, DND |
| `/provision/[mac]` | `app/provision/[mac]/route.ts` | Serve per-MAC phone config (tokened) |
| `/media/recording/[id]` | `app/media/recording/[id]/route.ts` | Stream a call recording via ARI (Admin/Manager) |
| `/api/health` | `app/api/health/route.ts` | Health JSON (reads SystemStatus) |

## Features (`src/features/<feature>/`) — UI + Server Actions
| Feature | Files | Notes |
|---|---|---|
| auth | `auth/actions.ts`, `auth/login-form.tsx` | login/logout (seeded admin) |
| extensions | `extensions/actions.ts` | ext CRUD → `upsertExtensionPjsip` (ps_endpoint/auth/aor) + mailbox |
| trunks | `trunks/actions.ts`, `trunks/telnyx-template.ts` | BYO trunk → `upsertTrunkPjsip` (endpoint/aor/auth/identify/registration) |
| dids · inbound-routes · outbound-routes | `*/actions.ts` | number inventory + routing (read by `telephony/destinations`) |
| ring-groups | `ring-groups/actions.ts` | group + member rebuild |
| provisioning | `provisioning/actions.ts` | Device CRUD; provisioning URL from `provisioning/secrets` |
| guardrails · e911 · settings | `*/actions.ts` | singletons + E911 locations (reporting is read-only, no actions) |
| users | `users/actions.ts` | ADMIN-only: create/role/link-extension/reset-password |
| business-hours · voicemail · ivr | `*/actions.ts` | time conditions · VM transcribe toggle · IVR flow/node/option CRUD |
| portal | `portal/actions.ts`, `portal/softphone.tsx` | user portal: SIP.js WebRTC softphone (client) + DND toggle |

## Call-control engine (`src/telephony/`) — worker-safe
| File | Responsibility |
|---|---|
| `ariClient.ts` | Thin fetch-based ARI REST wrapper (answer/bridge/originate/play/record/continue/vars) |
| `connection.ts` | ARI events WS lifecycle + backoff reconnect + heartbeat (inbound WS; outbound-WS upgrade noted) |
| `stateRecovery.ts` | Re-adopt in-flight channels on reconnect (via CALLREC_ID channel var) |
| `dispatcher.ts` | ARI event router (StasisStart / DTMF / ChannelDestroyed) |
| `routing.ts` | StasisStart pipeline (internal / inbound / outbound / dialed / spine) |
| `destinations.ts` | resolvers: extension, ring-group, IVR, voicemail, time-condition + inbound/outbound/internal entry |
| `ivrInterpreter.ts` | DB IvrFlow/IvrNode state machine (DTMF-driven, no generated dialplan) |
| `originate.ts` | dial-group primitive (bridge + first-answer-wins ring + failover) |
| `callSession.ts` · `callRecord.ts` · `recording.ts` · `status.ts` · `events.ts` | in-memory registry · CDR create/finalize · **call recording + SUMMARIZE_CALL enqueue** · SystemStatus · typed shapes |
| `realtime/{odbcPool,psSchema,psWriter,reconcile}.ts` | Prisma truth → Asterisk ps_* tables (`asterisk` schema) + reconcile |

## Provisioning (`src/provisioning/`)
| File | Responsibility |
|---|---|
| `renderer.ts` · `registry.ts` · `context.ts` | `DeviceRenderer` interface + vendor dispatch + DB-backed config context |
| `vendors/fanvil.ts` | Fanvil config (mandatory header + SIP account + BLF keys) — golden-tested |
| `secrets.ts` · `sipPnp.ts` | per-MAC HMAC token + SIP-PnP parse/response helpers |
| `vendors/{yealink,grandstream,poly}.ts` | `[later]` — same interface |

## Async AI (`src/ai/`) — worker-safe
| File | Responsibility |
|---|---|
| `stages/transcribeVoicemail.ts` · `stages/summarizeCall.ts` | STT → Claude summary → DB |
| `providers/stt/{sttProvider,mockSttProvider,deepgramSttProvider,resolve}.ts` | STT seam (mock default, Deepgram) |
| `providers/llm/{llmProvider,mockLlmProvider,anthropicLlmProvider,resolve}.ts` | Claude summary seam (mock default) |
| `prompts/callSummary.ts` · `media.ts` | prompts; recording/VM file existence |

## Shared infra (`src/lib/`) — worker-safe
| File | Responsibility |
|---|---|
| `db.ts` · `env.ts` · `queue.ts` · `heartbeat.ts` | Prisma+pg singleton · typed env · AiJob queue · heartbeat wrapper |
| `auth.ts` · `guards.ts` · `password.ts` · `crypto-vault.ts` | JWT session · role guards · bcrypt · AES-256-GCM vault |
| `phone.ts` · `guardrail.ts` · `businessHours.ts` · `e911.ts` · `ids.ts` | dial classify/pattern · toll-fraud engine · time rules · emergency rules · channel/MAC helpers |
| `src/components/sidebar.tsx` | admin nav (client, active link) |

## Data + scripts + tests
| File | Responsibility |
|---|---|
| `prisma/schema.prisma` · `prisma/seed.ts` | 27 models (public) · seed (admin, singletons, demo exts, Telnyx template) |
| `scripts/apply-asterisk-sql.ts` | applies `asterisk/sql/*.sql` (Asterisk-owned schema) |
| `scripts/originate-test.ts` | Phase-0 spine check (server calls a phone → plays demo) |
| `scripts/smoke-live.ts` | opt-in live ARI + STT/LLM check |
| `test/*.test.ts` | phone · guardrail · businessHours · e911 · ids · provisioning (48 tests, offline) |

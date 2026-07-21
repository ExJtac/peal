# CODEMAP — pbx (Custom AI-PBX)

Source of truth for navigation. When a feature is added/moved/removed, update this in the
same step. Consult this FIRST, then open only the mapped file(s).

> 🏗️ **STATUS: not yet scaffolded.** Every row below is the *planned* layout from
> `BUILD-PLAN.md`, tagged by build phase `[phase N]`. As each module is created, drop its tag
> and confirm the file path. Nothing here exists on disk yet.

## Long-running processes (`worker/`)
| Process | File | What it does |
|---|---|---|
| `npm run ari` | `worker/ari/index.ts` | ARI call-control daemon — outbound-WS server, event loop, state recovery [phase 0] |
| `npm run worker` | `worker/jobs/index.ts` | Async-AI job worker — DB-backed claim loop (reuses `lib/queue.ts`) [phase 2] |
| `npm run pnp` | `worker/pnp/index.ts` | SIP-PnP multicast responder for zero-touch provisioning [phase 1] |

## Engine config (`asterisk/` — checked in, dev==prod, NOT Prisma)
| File | What it does |
|---|---|
| `asterisk/lima/pbx.yaml` | Lima Debian 13 bridged VM template [phase 0] |
| `asterisk/build/build-asterisk.sh` | Pinned Asterisk 22 source build + menuselect module set [phase 0] |
| `asterisk/etc/*.conf` | pjsip / sorcery / extconfig / res_odbc / ari / http / extensions / cdr / cel [phase 0] |
| `asterisk/sql/*.sql` | Raw migrations for Asterisk-owned tables (ps_*/cdr/cel) in schema `asterisk` [phase 0] |

## Routes (`src/app/`)
| Route | File | What it does |
|---|---|---|
| `/` | `app/(admin)/page.tsx` | Dashboard: system health, active channels, recent calls [phase 1] |
| `/login` | `app/login/page.tsx` | Admin login (JWT cookie) [phase 1] |
| `/extensions` | `app/(admin)/extensions/page.tsx` | Extensions CRUD → writes ps_* [phase 1] |
| `/trunks` | `app/(admin)/trunks/page.tsx` | SIP trunks (Telnyx first) [phase 1] |
| `/dids` | `app/(admin)/dids/page.tsx` | DID inventory + routing [phase 1] |
| `/inbound` | `app/(admin)/inbound/page.tsx` | Inbound routes (DID → destination) [phase 1] |
| `/outbound` | `app/(admin)/outbound/page.tsx` | Outbound routes + caller-ID rules [phase 1] |
| `/ring-groups` | `app/(admin)/ring-groups/page.tsx` | Ring groups [phase 1] |
| `/ivr` | `app/(admin)/ivr/page.tsx` (+ `ivr/[id]`) | IVR flow editor (DB model) [phase 1] |
| `/voicemail` | `app/(admin)/voicemail/page.tsx` (+ `[mailbox]`) | Mailboxes + messages (transcript/summary) [phase 1] |
| `/provisioning` | `app/(admin)/provisioning/page.tsx` | Devices (MAC/model), config preview [phase 1] |
| `/guardrails` | `app/(admin)/guardrails/page.tsx` | Toll-fraud caps + block log [phase 1] |
| `/e911` | `app/(admin)/e911/page.tsx` | Dispatchable locations + go-live gate [phase 1] |
| `/reporting` | `app/(admin)/reporting/page.tsx` (+ `[callId]`) | CDR + call detail [phase 1] |
| `/settings` | `app/(admin)/settings/page.tsx` | Company, business hours, SIP settings [phase 1] |
| `/users` | `app/(admin)/users/page.tsx` | Admin/operator logins [phase 1] |
| `/provision/[mac]` | `app/provision/[mac]/route.ts` | Serve per-MAC phone config (tokened HTTPS) [phase 1] |
| `/media/vm/[id]` | `app/media/vm/[id]/route.ts` | Stream a voicemail recording [phase 1] |
| `/api/health` | `app/api/health/route.ts` | Health JSON (reads SystemStatus) [phase 1] |

## Features (`src/features/<feature>/`) — UI + Server Actions
| Feature | Files | Notes |
|---|---|---|
| auth | `auth/actions.ts`, `auth/login-form.tsx` | login/logout (seeded admin, no self-register) [phase 1] |
| extensions | `extensions/actions.ts`, `extensions/*.tsx` | ext CRUD → psWriter (endpoint/auth/aor) + mailbox [phase 1] |
| trunks | `trunks/actions.ts`, `trunks/telnyx-template.ts`, `trunks/*.tsx` | BYO trunk; Telnyx template first [phase 1] |
| dids · inbound-routes · outbound-routes | `*/actions.ts` + `*.tsx` | number inventory + routing [phase 1] |
| ring-groups · ivr · voicemail | `*/actions.ts` + `*.tsx` | call destinations + VM overlay [phase 1] |
| provisioning | `provisioning/actions.ts`, `provisioning/*.tsx` | Device CRUD + config preview [phase 1] |
| guardrails · e911 | `*/actions.ts` + `*.tsx` | toll-fraud + emergency compliance [phase 1] |
| reporting · settings · users · system | `*/actions.ts` + `*.tsx` | CDR, config, logins, health [phase 1] |

## Call-control engine (`src/telephony/`) — worker-safe
| File | Responsibility |
|---|---|
| `ariClient.ts` | Thin typed ARI REST wrapper (answer/bridge/originate/playback/record/snoop) [phase 0] |
| `connection.ts` | Outbound-WS lifecycle + backoff reconnect + heartbeat [phase 0] |
| `stateRecovery.ts` | Re-adopt in-flight channels/bridges on reconnect [phase 0] |
| `dispatcher.ts` | ARI event router [phase 0] |
| `routing.ts` | StasisStart pipeline (inbound/outbound/internal) [phase 1] |
| `destinations/*.ts` | extension/ringGroup/ivr/voicemail/timeCondition resolvers [phase 1] |
| `ivrInterpreter.ts` | DB IvrFlow/IvrNode state machine (no generated dialplan) [phase 1] |
| `ringStrategy.ts` · `originate.ts` · `bridging.ts` · `callSession.ts` · `callRecord.ts` | call primitives + records [phase 1] |
| `realtime/{psWriter,psSchema,reconcile,odbcPool}.ts` | Prisma truth → ps_* tables + targeted reload [phase 1] |

## Provisioning (`src/provisioning/`)
| File | Responsibility |
|---|---|
| `renderer.ts` · `registry.ts` · `context.ts` | `DeviceRenderer` interface + vendor dispatch + config context [phase 1] |
| `vendors/fanvil.ts` | Fanvil config (mandatory 64-byte header + sysConf XML / P-value) [phase 1] |
| `vendors/{yealink,grandstream,poly}.ts` | later vendors [phase 3] |
| `secrets.ts` · `sipPnp.ts` | per-MAC token + AES; SIP-PnP responder logic [phase 1] |

## Async AI (`src/ai/`) — worker-safe
| File | Responsibility |
|---|---|
| `stages/transcribeVoicemail.ts` · `stages/summarizeCall.ts` | VM/call → STT → Claude summary [phase 2] |
| `providers/stt/*` · `providers/llm/*` | switchable STT/LLM seams, mock default [phase 2] |
| `prompts/*` · `media.ts` | prompts + schemas; recording/VM file access [phase 2] |

## Shared infra (`src/lib/`) — worker-safe
| File | Responsibility |
|---|---|
| `db.ts` | Prisma 7 + pg adapter singleton [phase 0] |
| `auth.ts` · `guards.ts` · `password.ts` | JWT session + role guards + bcrypt [phase 1] |
| `crypto-vault.ts` | AES-256-GCM for SIP/trunk/VM secrets [phase 1] |
| `env.ts` · `engines.ts` | typed env + ARI/STT availability checks [phase 0] |
| `queue.ts` | DB-backed job queue (reused from video-to-story) [phase 2] |
| `asteriskControl.ts` | ARI module reload/info/ping [phase 1] |
| `phone.ts` · `guardrail.ts` · `e911.ts` · `businessHours.ts` | E.164/dial-pattern, toll-fraud engine, emergency rules, time rules [phase 1] |
| `audit.ts` · `ids.ts` | audit log; uniqueid/linkedid ↔ CallRecord correlation [phase 1] |

## Data model (`prisma/schema.prisma`) — public schema, our app only
Planned models: User, Extension, Trunk, Did, InboundRoute, OutboundRoute, RingGroup(+Member),
IvrFlow(+Node/+Option), BusinessHours, Device, CallRecord, Transcript, VoicemailBox(+Message),
GuardrailPolicy(+SpendCounter/+VelocityCounter/+BlockEvent), E911Location, CompanySettings,
Setting, AuditLog, SystemStatus, AiJob. **Asterisk-owned `ps_*`/`cdr`/`cel` live in schema
`asterisk` via `asterisk/sql/*.sql` — NEVER `prisma migrate`.** [phase 1]

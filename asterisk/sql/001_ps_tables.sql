-- =====================================================================================
-- 001_ps_tables.sql — Asterisk PJSIP realtime (ARA) schema.
--
-- OWNER: Asterisk (NOT Prisma). Apply with raw psql:
--     psql -d pbx -f asterisk/sql/001_ps_tables.sql
-- `prisma migrate` must NEVER touch schema "asterisk".
--
-- These tables are read live by Asterisk via res_config_odbc + sorcery over ODBC
-- (search_path = asterisk,public, set by the DSN in odbc.ini). Our control plane's
-- psWriter.ts writes ps_endpoints/ps_auths/ps_aors/ps_endpoint_id_ips/ps_registrations
-- from Prisma "truth". ps_contacts is ASTERISK-MANAGED (the registrar writes it) — we
-- never write it.
--
-- Enum-like PJSIP columns are modeled as varchar (Asterisk validates values itself).
-- Column sets follow Asterisk's canonical alembic realtime schema (contrib/ast-db-manage),
-- trimmed to the commonly-used core so res_config_odbc has the columns it SELECTs for a
-- basic endpoint/auth/aor/identify/registration.
-- =====================================================================================

CREATE SCHEMA IF NOT EXISTS asterisk;
SET search_path TO asterisk, public;

-- Reusable yes/no domain would need superuser DDL each run; plain varchar keeps it simple
-- and matches how Asterisk treats these ("yes"/"no").

-- -------------------------------------------------------------------------------------
-- ps_auths — authentication objects (SIP credentials).
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ps_auths (
    id            varchar(40) PRIMARY KEY,
    auth_type     varchar(20),            -- userpass | md5 | google_oauth
    nonce_lifetime integer,
    md5_cred      varchar(40),
    password      varchar(80),
    realm         varchar(40),
    username      varchar(40),
    refresh_token varchar(255),
    oauth_clientid varchar(255),
    oauth_secret  varchar(255)
);

-- -------------------------------------------------------------------------------------
-- ps_aors — Address of Record (where an endpoint can be reached; holds contacts config).
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ps_aors (
    id                   varchar(40) PRIMARY KEY,
    contact              varchar(255),      -- static contact (trunks); phones register dynamically
    default_expiration   integer,
    mailboxes            varchar(80),
    max_contacts         integer,
    minimum_expiration   integer,
    remove_existing      varchar(3),        -- yes|no
    qualify_frequency    integer,
    authenticate_qualify varchar(3),        -- yes|no
    maximum_expiration   integer,
    outbound_proxy       varchar(255),
    support_path         varchar(3),        -- yes|no
    qualify_timeout      double precision,
    voicemail_extension  varchar(40),
    remove_unavailable   varchar(3)         -- yes|no
);

-- -------------------------------------------------------------------------------------
-- ps_contacts — dynamic contacts. ASTERISK-MANAGED (registrar). We never write this.
-- Mapped in extconfig so contacts survive restarts; DDL provided so the registrar can
-- persist here instead of astdb.
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ps_contacts (
    id                   varchar(255) PRIMARY KEY,
    uri                  varchar(511),
    expiration_time      bigint,
    qualify_frequency    integer,
    outbound_proxy       varchar(255),
    path                 text,
    user_agent           varchar(255),
    qualify_timeout      double precision,
    reg_server           varchar(255),
    authenticate_qualify varchar(3),        -- yes|no
    via_addr             varchar(40),
    via_port             integer,
    call_id              varchar(255),
    endpoint             varchar(40),
    prune_on_boot        varchar(3)         -- yes|no
);
CREATE INDEX IF NOT EXISTS ps_contacts_qualifyfreq_exp
    ON ps_contacts (qualify_frequency, expiration_time);

-- -------------------------------------------------------------------------------------
-- ps_endpoints — the SIP endpoint (phones AND trunks). Wide table; core columns here.
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ps_endpoints (
    id                          varchar(40) PRIMARY KEY,
    transport                   varchar(40),   -- e.g. transport-udp (from pjsip.conf)
    aors                        varchar(200),  -- comma-separated ps_aors ids
    auth                        varchar(100),  -- ps_auths id (inbound)
    context                     varchar(40),   -- dialplan context (e.g. from-internal)
    disallow                    varchar(200),  -- usually "all"
    allow                       varchar(200),  -- e.g. ulaw,alaw,opus
    direct_media                varchar(3),    -- yes|no
    connected_line_method       varchar(20),
    direct_media_method         varchar(20),
    direct_media_glare_mitigation varchar(20),
    disable_direct_media_on_nat varchar(3),
    dtmf_mode                   varchar(20),   -- rfc4733 | inband | info | auto
    external_media_address      varchar(40),
    force_rport                 varchar(3),
    ice_support                 varchar(3),
    identify_by                 varchar(80),   -- username | auth_username | ip ...
    mailboxes                   varchar(40),   -- mailbox@context for MWI
    moh_suggest                 varchar(40),
    outbound_auth               varchar(40),   -- ps_auths id (outbound, e.g. trunk REGISTER)
    outbound_proxy              varchar(255),
    rewrite_contact             varchar(3),    -- yes|no (NAT'd phones)
    rtp_ipv6                    varchar(3),
    rtp_symmetric               varchar(3),    -- yes|no (NAT)
    send_diversion              varchar(3),
    send_pai                    varchar(3),
    send_rpid                   varchar(3),
    timers_min_se               integer,
    timers                      varchar(20),   -- yes|no|required|always
    timers_sess_expires         integer,
    callerid                    varchar(80),   -- "Name" <number>
    callerid_privacy            varchar(20),
    callerid_tag                varchar(40),
    trust_id_inbound            varchar(3),
    trust_id_outbound           varchar(3),
    send_connected_line         varchar(3),
    accountcode                 varchar(80),
    language                    varchar(10),
    use_ptime                   varchar(3),
    use_avpf                    varchar(3),
    media_encryption            varchar(20),   -- no | sdes | dtls
    media_encryption_optimistic varchar(3),
    inband_progress             varchar(3),
    call_group                  varchar(40),
    pickup_group                varchar(40),
    named_call_group            varchar(40),
    named_pickup_group          varchar(40),
    device_state_busy_at        integer,
    t38_udptl                   varchar(3),
    t38_udptl_ec                varchar(20),
    t38_udptl_maxdatagram       integer,
    fax_detect                  varchar(3),
    t38_udptl_nat               varchar(3),
    t38_udptl_ipv6              varchar(3),
    rtp_timeout                 integer,
    rtp_timeout_hold            integer,
    rtp_keepalive               integer,
    record_on_feature           varchar(40),
    record_off_feature          varchar(40),
    allow_transfer              varchar(3),
    user_eq_phone               varchar(3),
    moh_passthrough             varchar(3),
    media_use_received_transport varchar(3),
    one_touch_recording         varchar(3),
    rtcp_mux                    varchar(3),
    allow_subscribe             varchar(3),
    sub_min_expiry              integer,
    from_user                   varchar(40),
    from_domain                 varchar(255),
    mwi_from_user               varchar(40),
    dtls_verify                 varchar(40),
    dtls_setup                  varchar(20),
    srtp_tag_32                 varchar(3),
    set_var                     text,
    message_context             varchar(40),
    aggregate_mwi               varchar(3),
    bundle                      varchar(3),
    webrtc                      varchar(3)     -- convenience preset (implies dtls/ice/rtcp_mux)
);

-- -------------------------------------------------------------------------------------
-- ps_endpoint_id_ips — identify endpoints by source IP (trunk/ITSP ACL, e.g. Telnyx IPs).
-- Note: "match" is a valid (non-reserved) Postgres identifier and matches Asterisk's
-- generated realtime queries.
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ps_endpoint_id_ips (
    id                varchar(40) PRIMARY KEY,
    endpoint          varchar(40),         -- ps_endpoints id this IP maps to
    match             varchar(80),         -- IP or CIDR (e.g. 192.76.120.10/32)
    srv_lookups       varchar(3),          -- yes|no
    match_header      varchar(255),
    match_request_uri varchar(255)
);
CREATE INDEX IF NOT EXISTS ps_endpoint_id_ips_endpoint ON ps_endpoint_id_ips (endpoint);

-- -------------------------------------------------------------------------------------
-- ps_registrations — outbound REGISTER (Asterisk registers TO the ITSP, e.g. Telnyx).
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ps_registrations (
    id                       varchar(40) PRIMARY KEY,
    auth_rejection_permanent varchar(3),   -- yes|no
    client_uri               varchar(255),
    contact_user             varchar(40),
    expiration               integer,
    max_retries              integer,
    outbound_auth            varchar(40),  -- ps_auths id used for the REGISTER
    outbound_proxy           varchar(255),
    retry_interval           integer,
    forbidden_retry_interval integer,
    server_uri               varchar(255),
    transport                varchar(40),
    support_path             varchar(3),
    fatal_retry_interval     integer,
    line                     varchar(3),
    endpoint                 varchar(40)   -- endpoint to associate inbound-from-registrar
);

-- -------------------------------------------------------------------------------------
-- ps_domain_aliases — map alias domains to a canonical domain (optional, rarely used
-- single-tenant, but part of the realtime family map).
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ps_domain_aliases (
    id     varchar(80) PRIMARY KEY,
    domain varchar(80)
);

-- -------------------------------------------------------------------------------------
-- ps_globals — PJSIP global settings as a realtime object (optional; we keep the
-- authoritative [global] in pjsip.conf, but the table exists for completeness / tools
-- that expect it). Single-row table.
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ps_globals (
    id                        varchar(40) PRIMARY KEY,
    max_forwards              integer,
    user_agent                varchar(255),
    default_outbound_endpoint varchar(40),
    debug                     varchar(3),
    endpoint_identifier_order varchar(40),
    keep_alive_interval       integer,
    max_initial_qualify_time  integer,
    default_from_user         varchar(80),
    default_realm             varchar(40)
);

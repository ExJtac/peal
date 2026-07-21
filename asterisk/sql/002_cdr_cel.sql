-- =====================================================================================
-- 002_cdr_cel.sql — Asterisk CDR + CEL tables (schema "asterisk").
--
-- OWNER: Asterisk (NOT Prisma). Written natively by cdr_pgsql / cel_pgsql (libpq), which
-- target schema=asterisk (see cdr_pgsql.conf / cel_pgsql.conf). Apply with raw psql:
--     psql -d pbx -f asterisk/sql/002_cdr_cel.sql
-- Our control plane READS these for reporting and overlays a CallRecord from ARI events.
--
-- Columns follow Asterisk's standard cdr_pgsql / cel_pgsql column names. cdr_pgsql maps
-- CDR variables to same-named columns; cel_pgsql maps CEL variables likewise. "end" is a
-- reserved word and MUST stay quoted.
-- =====================================================================================

CREATE SCHEMA IF NOT EXISTS asterisk;
SET search_path TO asterisk, public;

-- -------------------------------------------------------------------------------------
-- cdr — one row per call leg (standard Asterisk CDR columns).
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cdr (
    accountcode  varchar(80),
    src          varchar(80),
    dst          varchar(80),
    dcontext     varchar(80),
    clid         varchar(120),
    channel      varchar(80),
    dstchannel   varchar(80),
    lastapp      varchar(80),
    lastdata     varchar(255),
    start        timestamp with time zone,
    answer       timestamp with time zone,
    "end"        timestamp with time zone,   -- reserved word: keep quoted
    duration     integer,
    billsec      integer,
    disposition  varchar(45),                -- ANSWERED | NO ANSWER | BUSY | FAILED | CONGESTION
    amaflags     varchar(45),                -- OMIT | BILLING | DOCUMENTATION | DEFAULT
    userfield    varchar(255),
    uniqueid     varchar(150),
    linkedid     varchar(150),
    peeraccount  varchar(80),
    sequence     integer
);
CREATE INDEX IF NOT EXISTS cdr_start      ON cdr (start);
CREATE INDEX IF NOT EXISTS cdr_uniqueid   ON cdr (uniqueid);
CREATE INDEX IF NOT EXISTS cdr_linkedid   ON cdr (linkedid);
CREATE INDEX IF NOT EXISTS cdr_src        ON cdr (src);
CREATE INDEX IF NOT EXISTS cdr_dst        ON cdr (dst);

-- -------------------------------------------------------------------------------------
-- cel — Channel Event Log: multiple rows per call (per-leg lifecycle events).
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cel (
    eventtype    varchar(30),               -- CHAN_START, ANSWER, HANGUP, BRIDGE_ENTER, ...
    eventtime    timestamp with time zone,
    cid_name     varchar(80),
    cid_num      varchar(80),
    cid_ani      varchar(80),
    cid_rdnis    varchar(80),
    cid_dnid     varchar(80),
    exten        varchar(80),
    context      varchar(80),
    channame     varchar(80),
    appname      varchar(80),
    appdata      varchar(255),
    amaflags     integer,
    accountcode  varchar(80),
    peeraccount  varchar(80),
    uniqueid     varchar(150),
    linkedid     varchar(150),
    userfield    varchar(255),
    peer         varchar(80),
    userdeftype  varchar(255),
    eventextra   varchar(255)
);
CREATE INDEX IF NOT EXISTS cel_eventtime  ON cel (eventtime);
CREATE INDEX IF NOT EXISTS cel_uniqueid   ON cel (uniqueid);
CREATE INDEX IF NOT EXISTS cel_linkedid   ON cel (linkedid);

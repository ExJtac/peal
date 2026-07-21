-- WebRTC (browser softphone) columns on ps_endpoints. Added separately so 001 stays the
-- canonical core; idempotent (ADD COLUMN IF NOT EXISTS). Setting webrtc='yes' makes Asterisk
-- apply the WebRTC media defaults; we also set the individual media columns explicitly so the
-- behavior is deterministic through realtime.
SET search_path TO asterisk, public;

ALTER TABLE ps_endpoints ADD COLUMN IF NOT EXISTS webrtc varchar(3);
ALTER TABLE ps_endpoints ADD COLUMN IF NOT EXISTS dtls_auto_generate_cert varchar(3);
ALTER TABLE ps_endpoints ADD COLUMN IF NOT EXISTS media_encryption varchar(10);
ALTER TABLE ps_endpoints ADD COLUMN IF NOT EXISTS media_use_received_transport varchar(3);
ALTER TABLE ps_endpoints ADD COLUMN IF NOT EXISTS rtcp_mux varchar(3);
ALTER TABLE ps_endpoints ADD COLUMN IF NOT EXISTS use_avpf varchar(3);
ALTER TABLE ps_endpoints ADD COLUMN IF NOT EXISTS dtls_verify varchar(40);
ALTER TABLE ps_endpoints ADD COLUMN IF NOT EXISTS dtls_setup varchar(20);

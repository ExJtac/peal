// RTP framing for the real-time AI media path (ARI externalMedia, slin16).
//
// Wire format (proven by probe): 12-byte RTP header + payload. For externalMedia `slin16` the
// payload is RAW 16-bit signed-linear PCM, 16 kHz mono, NATIVE-endian (little-endian on
// x86/arm) — NOT network-order L16. We read and write the same endianness, and Deepgram
// linear16 / PCM TTS are also little-endian, so no byte-swapping is ever needed.
//
// One 20 ms frame = 320 samples = 640 payload bytes. Asterisk streams ~50 packets/sec.
// Worker-safe (pure Node, no ARI/DB).

export const SAMPLE_RATE = 16000; // slin16
export const FRAME_MS = 20;
export const SAMPLES_PER_FRAME = (SAMPLE_RATE * FRAME_MS) / 1000; // 320
export const BYTES_PER_FRAME = SAMPLES_PER_FRAME * 2; // 640

export interface RtpPacket {
  version: number;
  marker: boolean;
  payloadType: number;
  seq: number;
  timestamp: number;
  ssrc: number;
  payload: Buffer;
}

/** Parse an inbound RTP packet from Asterisk. Returns null if it's too short to be RTP. */
export function parseRtp(buf: Buffer): RtpPacket | null {
  if (buf.length < 12) return null;
  const b0 = buf[0];
  const version = (b0 >> 6) & 0x03;
  const csrcCount = b0 & 0x0f;
  const headerLen = 12 + csrcCount * 4;
  if (buf.length < headerLen) return null;
  const b1 = buf[1];
  return {
    version,
    marker: (b1 & 0x80) !== 0,
    payloadType: b1 & 0x7f,
    seq: buf.readUInt16BE(2),
    timestamp: buf.readUInt32BE(4),
    ssrc: buf.readUInt32BE(8),
    payload: buf.subarray(headerLen),
  };
}

/**
 * Builds outbound RTP packets for the return (injection) path. Monotonic sequence + timestamp,
 * fixed SSRC per session. Echo the payload type Asterisk used on the inbound stream so the
 * UnicastRTP channel decodes our audio with its negotiated slin16 format.
 */
export class RtpFramer {
  private seq: number;
  private timestamp: number;
  constructor(
    private readonly ssrc: number,
    private readonly payloadType: number,
    seq = 0,
    timestamp = 0,
  ) {
    this.seq = seq & 0xffff;
    this.timestamp = timestamp >>> 0;
  }

  /** Wrap one 20 ms PCM frame (should be BYTES_PER_FRAME bytes) into an RTP packet. */
  frame(pcm: Buffer, marker = false): Buffer {
    const header = Buffer.allocUnsafe(12);
    header[0] = 0x80; // version 2, no padding/extension/CSRC
    header[1] = (marker ? 0x80 : 0x00) | (this.payloadType & 0x7f);
    header.writeUInt16BE(this.seq, 2);
    header.writeUInt32BE(this.timestamp >>> 0, 4);
    header.writeUInt32BE(this.ssrc >>> 0, 8);
    this.seq = (this.seq + 1) & 0xffff;
    this.timestamp = (this.timestamp + SAMPLES_PER_FRAME) >>> 0;
    return Buffer.concat([header, pcm]);
  }
}

/**
 * Split an arbitrary PCM buffer into exact 20 ms frames, zero-padding the final short frame to a
 * full frame so pacing stays on a clean 20 ms clock. Returns whole frames only.
 */
export function toFrames(pcm: Buffer): Buffer[] {
  const frames: Buffer[] = [];
  for (let off = 0; off < pcm.length; off += BYTES_PER_FRAME) {
    const chunk = pcm.subarray(off, off + BYTES_PER_FRAME);
    if (chunk.length === BYTES_PER_FRAME) {
      frames.push(chunk);
    } else {
      const padded = Buffer.alloc(BYTES_PER_FRAME); // zero-filled = silence
      chunk.copy(padded);
      frames.push(padded);
    }
  }
  return frames;
}

/** RMS energy of a little-endian int16 PCM frame, normalized 0..1. Used by the VAD. */
export function frameEnergy(pcm: Buffer): number {
  const n = Math.floor(pcm.length / 2);
  if (n === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const s = pcm.readInt16LE(i * 2) / 32768;
    sumSq += s * s;
  }
  return Math.sqrt(sumSq / n);
}

// UDP transport for one AI call's externalMedia RTP stream.
//
// Asterisk (in the VM) streams RTP to MEDIA_HOST:<port> and we send our TTS RTP back to the
// SOURCE addr:port of the first packet we received (symmetric RTP — the VM's ephemeral port is
// not known ahead of time). The socket is `unref()`d so a stuck media session can never keep the
// ARI daemon alive on SIGTERM. Worker-safe.
import dgram from "node:dgram";
import { parseRtp } from "./rtp";
import { RTP_PORT_START, RTP_PORT_END } from "@/lib/env";

interface Peer {
  address: string;
  port: number;
}

export class RtpTransport {
  private socket: dgram.Socket | null = null;
  private peer: Peer | null = null;
  private inboundPt = 118; // slin16 dynamic PT; overwritten by the first packet
  private closed = false;
  private frameCb: ((pcm: Buffer) => void) | null = null;
  private readyCb: (() => void) | null = null;

  constructor(public readonly port: number) {}

  /**
   * Fired once, when the first inbound packet arrives (peer + payload type learned). If the first
   * packet already arrived before this subscription (the common cross-host case: Asterisk starts
   * streaming the moment the externalMedia leg is bridged, before the session finishes wiring up),
   * replay immediately — otherwise the signal is lost and the call times out to fallback.
   */
  onReady(cb: () => void): void {
    this.readyCb = cb;
    if (this.peer) cb();
  }
  /** Fired for every inbound audio frame, with the raw PCM payload (slin16, little-endian). */
  onFrame(cb: (pcm: Buffer) => void): void {
    this.frameCb = cb;
  }

  get peerKnown(): boolean {
    return this.peer !== null;
  }
  /** The RTP payload type Asterisk is using — echo it on our outbound frames. */
  get payloadType(): number {
    return this.inboundPt;
  }

  bind(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = dgram.createSocket("udp4");
      this.socket = sock;
      sock.on("error", (e) => {
        if (!this.closed) reject(e);
      });
      sock.on("message", (msg, rinfo) => this.onMessage(msg, rinfo));
      sock.bind(this.port, "0.0.0.0", () => {
        sock.unref(); // never hold the event loop open
        resolve();
      });
    });
  }

  private onMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    if (this.closed) return;
    const pkt = parseRtp(msg);
    if (!pkt) return;
    if (!this.peer) {
      this.peer = { address: rinfo.address, port: rinfo.port };
      this.inboundPt = pkt.payloadType;
      this.readyCb?.();
    }
    this.frameCb?.(pkt.payload);
  }

  /** Send an already-framed RTP packet to the learned peer. No-op until the peer is known. */
  send(rtp: Buffer): void {
    if (this.closed || !this.socket || !this.peer) return;
    this.socket.send(rtp, this.peer.port, this.peer.address, () => {});
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.peer = null;
    if (this.socket) {
      this.socket.removeAllListeners();
      try {
        this.socket.close();
      } catch {
        /* already closed */
      }
      this.socket = null;
    }
  }
}

/**
 * Bind a transport on the first free UDP port in [RTP_PORT_START, RTP_PORT_END]. Each concurrent
 * AI call needs its own port; the range bounds how many can run at once (default 100 » 25 phones).
 */
export async function allocateTransport(): Promise<RtpTransport> {
  for (let port = RTP_PORT_START; port <= RTP_PORT_END; port++) {
    const t = new RtpTransport(port);
    try {
      await t.bind();
      return t;
    } catch {
      t.close(); // port in use — try the next one
    }
  }
  throw new Error(`no free RTP port in ${RTP_PORT_START}-${RTP_PORT_END}`);
}

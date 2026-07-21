import { describe, it, expect } from "vitest";
import dgram from "node:dgram";
import { allocateTransport } from "@/telephony/realtime-media/rtpTransport";
import { RtpFramer, BYTES_PER_FRAME } from "@/telephony/realtime-media/rtp";

function sendRtp(port: number, payload: Buffer, pt = 118): Promise<void> {
  return new Promise((resolve, reject) => {
    const c = dgram.createSocket("udp4");
    const framer = new RtpFramer(0xabcd, pt);
    c.send(framer.frame(payload), port, "127.0.0.1", (e) => {
      c.close();
      e ? reject(e) : resolve();
    });
  });
}

function waitFor(cond: () => boolean, ms = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (cond()) {
        clearInterval(iv);
        resolve();
      } else if (Date.now() - t0 > ms) {
        clearInterval(iv);
        reject(new Error("timeout"));
      }
    }, 5);
  });
}

describe("RtpTransport", () => {
  it("learns the peer + payload type from the first packet and delivers frames", async () => {
    const t = await allocateTransport();
    try {
      const frames: Buffer[] = [];
      t.onFrame((pcm) => frames.push(pcm));
      let ready = 0;
      t.onReady(() => ready++);

      await sendRtp(t.port, Buffer.alloc(BYTES_PER_FRAME, 0x42), 118);
      await waitFor(() => frames.length > 0);

      expect(frames[0].length).toBe(BYTES_PER_FRAME);
      expect(t.payloadType).toBe(118);
      expect(ready).toBe(1); // fired exactly once
    } finally {
      t.close();
    }
  });

  it("onReady REPLAYS when the first packet arrived before the subscription (the race fix)", async () => {
    const t = await allocateTransport();
    try {
      const frames: Buffer[] = [];
      t.onFrame((pcm) => frames.push(pcm));

      // Packet arrives BEFORE onReady is wired (the real cross-host ordering).
      await sendRtp(t.port, Buffer.alloc(BYTES_PER_FRAME, 1));
      await waitFor(() => frames.length > 0);

      // Subscribing now must replay immediately — otherwise the signal is lost → fallback.
      let ready = 0;
      t.onReady(() => ready++);
      expect(ready).toBe(1);
    } finally {
      t.close();
    }
  });

  it("send is a no-op before the peer is learned, and close is idempotent", async () => {
    const t = await allocateTransport();
    t.send(Buffer.alloc(12)); // no peer yet → must not throw
    t.close();
    t.close(); // idempotent
    expect(true).toBe(true);
  });
});

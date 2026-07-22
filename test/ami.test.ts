import { describe, it, expect } from "vitest";
import { createServer, type Server, type Socket } from "node:net";
import { buildLoginAction, buildNotifyAction, parseAmiBlocks, pjsipNotify } from "@/telephony/ami";

describe("AMI frame builders", () => {
  it("builds a login action with CRLF framing + blank-line terminator", () => {
    expect(buildLoginAction("pbx-ctl", "secret", "a1")).toBe(
      "Action: Login\r\nUsername: pbx-ctl\r\nSecret: secret\r\nActionID: a1\r\n\r\n",
    );
  });

  it("builds a check-sync NOTIFY with the reboot flag matching the mode", () => {
    const resync = buildNotifyAction("2001", "resync", "a2");
    expect(resync).toContain("Action: PJSIPNotify\r\n");
    expect(resync).toContain("Endpoint: 2001\r\n");
    expect(resync).toContain("Variable: Event=check-sync;reboot=false\r\n");
    expect(resync.endsWith("\r\n\r\n")).toBe(true);
    expect(buildNotifyAction("2001", "reboot", "a3")).toContain("Variable: Event=check-sync;reboot=true\r\n");
  });
});

describe("parseAmiBlocks", () => {
  it("ignores the connect banner and parses a single response block", () => {
    const raw =
      "Asterisk Call Manager/8.0.0\r\nResponse: Success\r\nActionID: a1\r\nMessage: Authentication accepted\r\n\r\n";
    const blocks = parseAmiBlocks(raw);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].response).toBe("Success");
    expect(blocks[0].actionid).toBe("a1");
    expect(blocks[0].message).toBe("Authentication accepted");
  });

  it("splits multiple blocks on the blank line", () => {
    const raw = "Response: Success\r\nActionID: a1\r\n\r\nResponse: Error\r\nActionID: a2\r\nMessage: nope\r\n\r\n";
    const blocks = parseAmiBlocks(raw);
    expect(blocks).toHaveLength(2);
    expect(blocks[1].response).toBe("Error");
    expect(blocks[1].message).toBe("nope");
  });
});

interface ScriptOpts {
  loginResponse?: "Success" | "Error";
  notifyResponse?: "Success" | "Error";
}

// A scripted loopback AMI server: writes the banner, echoes each action's ActionID in its response.
function startAmiServer(opts: ScriptOpts = {}): Promise<{ server: Server; port: number; received: string[] }> {
  const received: string[] = [];
  return new Promise((resolve) => {
    const server = createServer((socket: Socket) => {
      socket.write("Asterisk Call Manager/8.0.0\r\n");
      let buf = "";
      socket.on("data", (chunk) => {
        buf += chunk.toString("utf8");
        let idx: number;
        while ((idx = buf.indexOf("\r\n\r\n")) !== -1) {
          const frame = buf.slice(0, idx + 4);
          buf = buf.slice(idx + 4);
          received.push(frame);
          const b = parseAmiBlocks(frame)[0] ?? {};
          const actionId = b.actionid ?? "";
          const action = (b.action ?? "").toLowerCase();
          if (action === "login") {
            socket.write(`Response: ${opts.loginResponse ?? "Success"}\r\nActionID: ${actionId}\r\nMessage: Authentication accepted\r\n\r\n`);
          } else if (action === "pjsipnotify") {
            const resp = opts.notifyResponse ?? "Success";
            const msg = resp === "Success" ? "NOTIFY sent" : "Unable to send NOTIFY";
            socket.write(`Response: ${resp}\r\nActionID: ${actionId}\r\nMessage: ${msg}\r\n\r\n`);
          }
          // Logoff and anything else: ignore.
        }
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, port: typeof addr === "object" && addr ? addr.port : 0, received });
    });
  });
}

describe("pjsipNotify (socket round-trip)", () => {
  it("logs in and sends the check-sync NOTIFY, resolving ok", async () => {
    const { server, port, received } = await startAmiServer();
    try {
      const r = await pjsipNotify("2001", "reboot", { host: "127.0.0.1", port, user: "pbx-ctl", password: "s3cret", timeoutMs: 2000 });
      expect(r.ok).toBe(true);
      expect(r.message).toBe("NOTIFY sent");
      const joined = received.join("");
      expect(joined).toContain("Action: Login");
      expect(joined).toContain("Action: PJSIPNotify");
      expect(joined).toContain("Endpoint: 2001");
      expect(joined).toContain("Variable: Event=check-sync;reboot=true");
    } finally {
      server.close();
    }
  });

  it("reports failure when PJSIPNotify returns an Error", async () => {
    const { server, port } = await startAmiServer({ notifyResponse: "Error" });
    try {
      const r = await pjsipNotify("9999", "resync", { host: "127.0.0.1", port, password: "s3cret", timeoutMs: 2000 });
      expect(r.ok).toBe(false);
    } finally {
      server.close();
    }
  });

  it("reports failure when login is rejected", async () => {
    const { server, port } = await startAmiServer({ loginResponse: "Error" });
    try {
      const r = await pjsipNotify("2001", "resync", { host: "127.0.0.1", port, password: "wrong", timeoutMs: 2000 });
      expect(r.ok).toBe(false);
    } finally {
      server.close();
    }
  });

  it("fails fast (no socket) without an endpoint or without a password", async () => {
    expect((await pjsipNotify("", "resync", { password: "x" })).ok).toBe(false);
    expect((await pjsipNotify("2001", "resync", { password: "" })).ok).toBe(false);
  });
});

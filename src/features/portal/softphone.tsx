"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Browser softphone built on SIP.js's SimpleUser (handles the WebRTC peer connection, DTLS-SRTP
// media, and registration). Connects to Asterisk over WS (/ws); the linked extension's SIP
// credentials are passed in from the server (only the logged-in owner sees them).

type Props = {
  wsUrl: string;
  sipDomain: string;
  authUser: string;
  password: string;
  displayName: string;
  extension: string;
};

type Reg = "connecting" | "registered" | "failed" | "unconfigured";
type Call = "idle" | "outgoing" | "incoming" | "active";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function Softphone({ wsUrl, sipDomain, authUser, password, displayName }: Props) {
  const [reg, setReg] = useState<Reg>(wsUrl ? "connecting" : "unconfigured");
  const [call, setCall] = useState<Call>("idle");
  const [dial, setDial] = useState("");
  const [peer, setPeer] = useState("");
  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const suRef = useRef<{ connect(): Promise<void>; register(): Promise<void>; unregister(): Promise<void>; disconnect(): Promise<void>; call(t: string): Promise<void>; answer(): Promise<void>; decline(): Promise<void>; hangup(): Promise<void>; mute(): void; unmute(): void; hold(): Promise<void>; unhold(): Promise<void>; sendDTMF(d: string): void } | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);
  const startTimer = useCallback(() => {
    setSecs(0);
    stopTimer();
    timerRef.current = setInterval(() => setSecs((s) => s + 1), 1000);
  }, [stopTimer]);

  useEffect(() => {
    if (!wsUrl) return;
    let cancelled = false;
    let su: NonNullable<typeof suRef.current> | null = null;

    (async () => {
      try {
        const { Web } = await import("sip.js");
        if (cancelled) return;
        su = new Web.SimpleUser(wsUrl, {
          aor: `sip:${authUser}@${sipDomain}`,
          media: { remote: { audio: audioRef.current ?? undefined } },
          userAgentOptions: {
            authorizationUsername: authUser,
            authorizationPassword: password,
            displayName,
          },
          delegate: {
            onServerDisconnect: () => !cancelled && setReg("failed"),
            onRegistered: () => !cancelled && setReg("registered"),
            onUnregistered: () => !cancelled && setReg("failed"),
            onCallReceived: () => {
              if (cancelled) return;
              setCall("incoming");
              setPeer("Incoming call");
            },
            onCallAnswered: () => {
              if (cancelled) return;
              setCall("active");
              startTimer();
            },
            onCallHangup: () => {
              if (cancelled) return;
              setCall("idle");
              setPeer("");
              setMuted(false);
              setHeld(false);
              stopTimer();
            },
          },
        }) as unknown as NonNullable<typeof suRef.current>;
        suRef.current = su;
        await su.connect();
        await su.register();
      } catch (e) {
        if (!cancelled) {
          setReg("failed");
          setErr((e as Error).message);
        }
      }
    })();

    return () => {
      cancelled = true;
      stopTimer();
      try {
        su?.unregister();
        su?.disconnect();
      } catch {
        /* ignore */
      }
    };
  }, [wsUrl, authUser, password, sipDomain, displayName, startTimer, stopTimer]);

  const placeCall = async () => {
    const su = suRef.current;
    if (!su || !dial) return;
    try {
      setErr(null);
      setPeer(dial);
      setCall("outgoing");
      await su.call(`sip:${dial}@${sipDomain}`);
    } catch (e) {
      setErr((e as Error).message);
      setCall("idle");
    }
  };
  const answer = async () => {
    try {
      await suRef.current?.answer();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const decline = async () => {
    try {
      await suRef.current?.decline();
    } catch {
      /* ignore */
    }
    setCall("idle");
  };
  const hangup = async () => {
    try {
      await suRef.current?.hangup();
    } catch {
      /* ignore */
    }
    setCall("idle");
    stopTimer();
  };
  const toggleMute = () => {
    const su = suRef.current;
    if (!su) return;
    if (muted) su.unmute();
    else su.mute();
    setMuted(!muted);
  };
  const toggleHold = async () => {
    const su = suRef.current;
    if (!su) return;
    try {
      if (held) await su.unhold();
      else await su.hold();
      setHeld(!held);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  // Blind transfer via SIP REFER. SimpleUser doesn't expose refer(), so we reach its (private)
  // session, which is a SIP.js Session with a public .refer(). The referred call re-enters Asterisk
  // as a normal internal call, so transferring to an extension / ring group / QUEUE just works.
  const transfer = async () => {
    const su = suRef.current;
    if (!su || call !== "active") return;
    const target = window.prompt("Blind transfer to (extension, queue, or ring-group number):")?.trim();
    if (!target) return;
    try {
      const { UserAgent } = await import("sip.js");
      const uri = UserAgent.makeURI(`sip:${target}@${sipDomain}`);
      if (!uri) throw new Error("invalid transfer target");
      const session = (su as unknown as { session?: { refer?: (to: unknown) => Promise<unknown> } }).session;
      if (!session?.refer) throw new Error("transfer not available");
      await session.refer(uri);
      setPeer(`transferring to ${target}…`);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const press = (d: string) => {
    if (call === "active") {
      try {
        suRef.current?.sendDTMF(d);
      } catch {
        /* ignore */
      }
    }
    setDial((v) => v + d);
  };

  const badge =
    reg === "registered" ? "badge-online" : reg === "connecting" ? "badge-warn" : "badge-offline";
  const badgeText =
    reg === "registered" ? "Ready" : reg === "connecting" ? "Connecting…" : reg === "unconfigured" ? "Not configured" : "Offline";

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-medium">Softphone</h2>
        <span className={`badge ${badge}`}>{badgeText}</span>
      </div>

      {reg === "unconfigured" && (
        <p className="muted text-sm mb-3">
          Browser calling isn&apos;t configured yet — set <code>SIP_WS_URL</code> (or
          <code> SIP_SERVER_HOST</code>) in <code>.env</code> to the VM&apos;s WebSocket, then reload.
        </p>
      )}
      {err && <p className="error text-sm mb-3">{err}</p>}

      {call === "idle" ? (
        <>
          <input
            className="input mb-3 text-center text-lg tracking-widest"
            value={dial}
            onChange={(e) => setDial(e.target.value.replace(/[^\d*#+]/g, ""))}
            placeholder="extension or number"
            onKeyDown={(e) => e.key === "Enter" && placeCall()}
          />
          <div className="grid grid-cols-3 gap-2 mb-3">
            {DIGITS.map((d) => (
              <button key={d} type="button" className="btn-ghost py-3 text-lg" onClick={() => press(d)}>
                {d}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn flex-1" disabled={reg !== "registered" || !dial} onClick={placeCall}>
              Call
            </button>
            <button type="button" className="btn-ghost" onClick={() => setDial("")}>
              Clear
            </button>
          </div>
        </>
      ) : (
        <div className="text-center py-4">
          <div className="text-lg font-medium">{peer || "Call"}</div>
          <div className="muted text-sm mb-4">
            {call === "incoming" ? "ringing…" : call === "outgoing" ? "calling…" : fmt(secs)}
          </div>

          {call === "active" && (
            <div className="grid grid-cols-3 gap-2 mb-4 max-w-xs mx-auto">
              {DIGITS.map((d) => (
                <button key={d} type="button" className="btn-ghost py-2" onClick={() => press(d)}>
                  {d}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2 justify-center">
            {call === "incoming" ? (
              <>
                <button type="button" className="btn" onClick={answer}>Answer</button>
                <button type="button" className="btn-danger" onClick={decline}>Decline</button>
              </>
            ) : (
              <>
                {call === "active" && (
                  <>
                    <button type="button" className="btn-ghost" onClick={toggleMute}>
                      {muted ? "Unmute" : "Mute"}
                    </button>
                    <button type="button" className="btn-ghost" onClick={toggleHold}>
                      {held ? "Resume" : "Hold"}
                    </button>
                    <button type="button" className="btn-ghost" onClick={transfer}>
                      Transfer
                    </button>
                  </>
                )}
                <button type="button" className="btn-danger" onClick={hangup}>Hang up</button>
              </>
            )}
          </div>
        </div>
      )}

      <audio ref={audioRef} autoPlay />
    </div>
  );
}

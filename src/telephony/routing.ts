// StasisStart entry point. The trivial dialplan hands every call here with an arg telling us
// the branch: internal / inbound / outbound (or "dialed" for a leg we originated). Everything
// downstream is our own routing logic.
import { ari } from "./ariClient";
import { onDialedAnswered } from "./originate";
import { routeInbound, routeInternal, routeOutbound } from "./destinations";
import type { AriEvent } from "./events";

export async function onStasisStart(event: AriEvent): Promise<void> {
  const channel = event.channel;
  if (!channel) return;
  // externalMedia channels (the real-time AI media leg) re-enter Stasis with no args. The AI
  // agent session already owns them (added to its bridge by the id returned from create), so
  // routing must NOT touch them — otherwise the default branch would hang them up.
  if (channel.name?.startsWith("UnicastRTP/")) return;
  const args = event.args ?? [];
  const kind = args[0];
  const callerNum = channel.caller?.number ?? "";

  switch (kind) {
    case "dialed":
      // A leg we originated just answered — hand to the dial-group bridger.
      return onDialedAnswered(channel.id);
    case "internal":
      return routeInternal(channel.id, callerNum, args[1] ?? channel.dialplan?.exten ?? "");
    case "inbound":
      return routeInbound(channel.id, callerNum, args[1] ?? channel.dialplan?.exten ?? "");
    case "outbound":
      return routeOutbound(channel.id, callerNum, args[1] ?? channel.dialplan?.exten ?? "");
    case "spine": {
      // Phase-0 connectivity proof: answer, play a demo message, hang up. Lets the server
      // "call" a softphone/Fanvil to confirm ARI ↔ our app ↔ media all work end-to-end.
      await ari.answer(channel.id).catch(() => {});
      await ari.play(channel.id, "sound:hello-world").catch(() => {});
      setTimeout(() => void ari.hangup(channel.id).catch(() => {}), 5000);
      return;
    }
    default:
      // Unknown entry — don't leave the channel stuck in Stasis.
      await ari.hangup(channel.id).catch(() => {});
  }
}

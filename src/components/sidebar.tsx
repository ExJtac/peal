"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: [string, string][] = [
  ["/", "Dashboard"],
  ["/extensions", "Extensions"],
  ["/trunks", "Trunks"],
  ["/dids", "DIDs"],
  ["/inbound", "Inbound Routes"],
  ["/outbound", "Outbound Routes"],
  ["/ring-groups", "Ring Groups"],
  ["/queues", "Queues"],
  ["/ivr", "IVR / Auto-Attendant"],
  ["/ai-agents", "AI Receptionist"],
  ["/business-hours", "Business Hours"],
  ["/voicemail", "Voicemail"],
  ["/provisioning", "Provisioning"],
  ["/guardrails", "Guardrails"],
  ["/e911", "E911"],
  ["/reporting", "Reporting"],
  ["/settings", "Settings"],
];

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const links = isAdmin ? [...LINKS, ["/users", "Users"] as [string, string]] : LINKS;
  return (
    <nav className="space-y-1">
      {links.map(([href, label]) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link key={href} href={href} className={`nav-link ${active ? "nav-link-active" : ""}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

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
  ["/provisioning", "Provisioning"],
  ["/guardrails", "Guardrails"],
  ["/e911", "E911"],
  ["/reporting", "Reporting"],
  ["/settings", "Settings"],
];

export function Sidebar() {
  const path = usePathname();
  return (
    <nav className="space-y-1">
      {LINKS.map(([href, label]) => {
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

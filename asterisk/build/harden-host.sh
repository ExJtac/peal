#!/usr/bin/env bash
#
# harden-host.sh — lock down the SIP edge WITHOUT a separate SBC (Asterisk-as-B2BUA is the SBC for a
# <=25-phone single-tenant box). Installs the fail2ban jail on Asterisk's security log and an nftables
# firewall that scopes SIP/RTP/console to the LAN (+ an empty trunk set that TRUNK-SETUP.md fills), and
# keeps AMI (5038) / Postgres (5432) on loopback. Idempotent (named-table flush + cp -f). Run as root.
#
# Env: REPO_DIR (default /opt/pbx), LAN_CIDR (auto-derived /24 if unset).
#
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/pbx}"
LAN_CIDR="${LAN_CIDR:-}"
log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

log "Installing edge packages (fail2ban, nftables, iptables shim)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
# iptables (nft-backed on Debian 13) backs fail2ban's shipped iptables-allports action; nftables is
# our base firewall. They coexist: fail2ban uses its own tables, we manage a separate `inet pbx` table.
apt-get install -y fail2ban nftables iptables

# ---- fail2ban jail on Asterisk's security log ----
log "Enabling the fail2ban 'asterisk' jail"
install -m 0644 "${REPO_DIR}/asterisk/security/pbx-asterisk.local" /etc/fail2ban/jail.d/pbx-asterisk.local
# Ensure the logpath exists so the jail starts before Asterisk has written its first security line.
mkdir -p /var/log/asterisk
[ -f /var/log/asterisk/security ] || : > /var/log/asterisk/security
chown asterisk:asterisk /var/log/asterisk/security 2>/dev/null || true
systemctl enable --now fail2ban
fail2ban-client reload >/dev/null 2>&1 || systemctl restart fail2ban
echo "  jail active: 5 fails / 10 min → 1 h ban (/var/log/asterisk/security)"

# ---- derive the LAN /24 if not provided ----
if [ -z "${LAN_CIDR}" ]; then
  # PBX_LAN_IP wins (multi-homed / bridged VM), else auto-detect the default-route source IP.
  LAN_IP="${PBX_LAN_IP:-$(ip -4 -o route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+' || true)}"
  if [ -n "${LAN_IP}" ]; then
    LAN_CIDR="${LAN_IP%.*}.0/24"
  else
    LAN_CIDR="192.168.0.0/16"
  fi
fi
echo "  LAN_CIDR=${LAN_CIDR}"

# ---- nftables firewall (managed table 'inet pbx'; flush+recreate = idempotent) ----
log "Applying nftables firewall (table inet pbx)"
nft list table inet pbx >/dev/null 2>&1 && nft delete table inet pbx
mkdir -p /etc/nftables.d
cat > /etc/nftables.d/pbx.nft <<NFT
table inet pbx {
  set trunk_ips {
    type ipv4_addr
    comment "SIP trunk peer IPs — TRUNK-SETUP.md adds these when you go live"
  }
  chain input {
    type filter hook input priority 0; policy drop;
    ct state established,related accept
    iif "lo" accept
    ct state invalid drop
    ip protocol icmp accept
    ip6 nexthdr ipv6-icmp accept
    tcp dport 22 accept comment "SSH — never lock the operator out"
    tcp dport 3001 ip saddr ${LAN_CIDR} accept comment "admin console"
    tcp dport 8088 ip saddr ${LAN_CIDR} accept comment "ARI + WebRTC /ws (LAN only; ARI is auth'd)"
    udp dport 5060 ip saddr ${LAN_CIDR} accept comment "SIP from LAN phones"
    udp dport 5060 ip saddr @trunk_ips accept comment "SIP from the trunk"
    udp dport 10000-20000 ip saddr ${LAN_CIDR} accept comment "RTP media (LAN)"
    udp dport 10000-20000 ip saddr @trunk_ips accept comment "RTP media (trunk)"
  }
  chain forward { type filter hook forward priority 0; policy drop; }
  chain output  { type filter hook output priority 0; policy accept; }
}
NFT
nft -f /etc/nftables.d/pbx.nft
# Persist across reboots: make nftables.service load our table.
[ -f /etc/nftables.conf ] || printf '#!/usr/sbin/nft -f\nflush ruleset\n' > /etc/nftables.conf
grep -q '/etc/nftables.d/pbx.nft' /etc/nftables.conf || echo 'include "/etc/nftables.d/pbx.nft"' >> /etc/nftables.conf
systemctl enable --now nftables
echo "  firewall active: SIP/RTP/console limited to ${LAN_CIDR} + trunk set; 5038/5432 loopback-only"

cat <<DONE

  Edge hardened (no separate SBC — Asterisk is the SBC for this deployment):
    - fail2ban 'asterisk' jail active
    - nftables 'inet pbx': default-drop; SSH open; console/ARI/SIP/RTP limited to ${LAN_CIDR}
    - AMI (5038) + Postgres (5432) reachable on loopback only
  When you add a SIP trunk (TRUNK-SETUP.md), allow its signaling IPs:
    nft add element inet pbx trunk_ips { <TRUNK_IP> }
DONE

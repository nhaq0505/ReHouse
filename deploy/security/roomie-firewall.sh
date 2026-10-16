#!/usr/bin/env bash
set -euo pipefail
/usr/sbin/nft list table inet roomie_host >/dev/null 2>&1 || /usr/sbin/nft add table inet roomie_host
/usr/sbin/nft -f /etc/rehouse/firewall.nft

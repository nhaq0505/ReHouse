#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH

readonly image_pattern='^ghcr\.io/nhaq0505/rehouse@sha256:[a-f0-9]{64}$'
read -r action image_ref extra <<< "${SSH_ORIGINAL_COMMAND:-}"

if [[ "$action" != deploy || -n "${extra:-}" || ! "${image_ref:-}" =~ $image_pattern ]]; then
  printf 'This key only accepts: deploy ghcr.io/nhaq0505/rehouse@sha256:<64 lowercase hex characters>\n' >&2
  exit 64
fi

exec sudo -n -- /usr/local/sbin/rehouse-deploy "$image_ref"

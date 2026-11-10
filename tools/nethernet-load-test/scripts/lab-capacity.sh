#!/usr/bin/env bash
set -Eeuo pipefail

action="${1:-prepare}"
confirmation="${2:-}"
properties="${PROPERTIES_FILE:-server.properties}"
state_dir=".supercores"
marker="$state_dir/lab-capacity-50-approved"
details="$state_dir/lab-capacity-50-details.txt"
marker_confirmation='I_CONFIRM_THIS_LABORATORY_IS_AUTHORIZED_FOR_50_CLIENTS'

fatal() { printf '[SuperCores] ERROR: %s\n' "$*" >&2; exit 1; }

read_value() {
    awk -F= '/^[[:space:]]*max-players=/{value=substr($0,index($0,"=")+1); gsub(/[[:space:]\r]/,"",value); print value; exit}' "$properties"
}

[[ -f "$properties" ]] || fatal "$properties is missing"
current="$(read_value)"

case "$action" in
    prepare)
        printf '[SuperCores] dry-run: current max-players=%s; proposed OFFLINE LAB value=50; no files changed\n' "${current:-not-set}"
        ;;
    apply)
        [[ "$confirmation" == '--confirm-laboratory-capacity-change' ]] || fatal 'apply requires --confirm-laboratory-capacity-change'
        [[ ! -e "$marker" ]] || fatal "$marker already exists"
        mkdir -p "$state_dir"
        printf '%s' "$marker_confirmation" > "$marker"
        printf 'Previous observed max-players: %s\nApproved UTC: %s\n' "${current:-not-set}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$details"
        printf '[SuperCores] 50-client capacity marker created; restart the laboratory to apply max-players=50\n'
        ;;
    restore)
        mkdir -p "$state_dir/backups"
        if [[ -f "$marker" ]]; then
            mv "$marker" "$state_dir/backups/lab-capacity-50-approved.restored-$(date -u +%Y%m%dT%H%M%SZ)-${BASHPID}"
        fi
        if [[ -f "$details" ]]; then
            mv "$details" "$state_dir/backups/lab-capacity-50-details.restored-$(date -u +%Y%m%dT%H%M%SZ)-${BASHPID}.txt"
        fi
        printf '[SuperCores] capacity marker retired; restart restores the Pterodactyl MAX_PLAYERS value\n'
        ;;
    *) fatal 'usage: lab-capacity.sh prepare | apply --confirm-laboratory-capacity-change | restore' ;;
esac

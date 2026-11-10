#!/usr/bin/env bash
set -Eeuo pipefail

readonly PROPERTIES_FILE="${PROPERTIES_FILE:-server.properties}"
readonly BDS_EXECUTABLE="${EXECUTABLE:-./bedrock_server}"
readonly MODE="${BEDROCK_NETWORK_MODE:-native}"
readonly REQUESTED_PROFILE="${NATIVE_PROFILE:-auto}"
readonly PORT="${SERVER_PORT:-19132}"
readonly CONFIGURED_ALLOW_LIST="${ALLOW_LIST:-false}"
readonly CONFIGURED_MAX_PLAYERS="${MAX_PLAYERS:-10}"
readonly STATE_DIR=".supercores"
readonly GUIDE_FILE="bedrock_server_how_to.html"
readonly LAB_OFFLINE_MARKER="$STATE_DIR/lab-offline-approved"
readonly LAB_OFFLINE_CONFIRMATION="I_ACKNOWLEDGE_THIS_IS_AN_ISOLATED_OFFLINE_LAB"
readonly LAB_NETWORK_MARKER="$STATE_DIR/lab-network-restriction-approved"
readonly LAB_NETWORK_CONFIRMATION="I_CONFIRM_NETWORK_ACCESS_IS_RESTRICTED_TO_AUTHORIZED_TEST_ORIGINS"
readonly LAB_CAPACITY_MARKER="$STATE_DIR/lab-capacity-50-approved"
readonly LAB_CAPACITY_CONFIRMATION="I_CONFIRM_THIS_LABORATORY_IS_AUTHORIZED_FOR_50_CLIENTS"
DETECTED_VERSION="${BDS_VERSION:-unknown}"
[[ ! -s "$STATE_DIR/bds-version" ]] || DETECTED_VERSION="$(tr -d '\r\n' < "$STATE_DIR/bds-version")"
readonly DETECTED_VERSION

log() { printf '[SuperCores] %s\n' "$*"; }
fatal() { printf '[SuperCores] ERROR: %s\n' "$*" >&2; exit 1; }

validate_port() {
    [[ "$1" =~ ^[0-9]+$ ]] || fatal "SERVER_PORT must be an integer, got: $1"
    (( 1 <= 10#$1 && 10#$1 <= 65535 )) || fatal "SERVER_PORT must be between 1 and 65535"
}

validate_player_limit() {
    [[ "$1" =~ ^[0-9]+$ ]] || fatal "MAX_PLAYERS must be an integer, got: $1"
    (( 1 <= 10#$1 && 10#$1 <= 200 )) || fatal "MAX_PLAYERS must be between 1 and 200"
}

validate_boolean() {
    [[ "$2" == 'true' || "$2" == 'false' ]] || fatal "$1 must be true or false, got: $2"
}

validate_ip_literal() {
    local value="$1"
    [[ -n "$value" && "$value" != "0.0.0.0" && "$value" != "::" ]] || return 1
    [[ "$value" =~ ^[0-9A-Fa-f:.]+$ ]]
}

resolve_public_ip() {
    local value="${PUBLIC_IP:-}"
    if [[ -z "$value" || "$value" == "0.0.0.0" || "$value" == "::" ]]; then
        value="${SERVER_IP:-}"
    fi
    validate_ip_literal "$value" || fatal "set PUBLIC_IP to the literal public IP receiving TCP+UDP ${PORT}; SERVER_IP=${SERVER_IP:-unset} is not advertisable"
    printf '%s' "$value"
}

resolve_online_mode() {
    local confirmation network_confirmation
    if [[ ! -f "$LAB_OFFLINE_MARKER" ]]; then
        printf 'true'
        return
    fi
    confirmation="$(tr -d '\r\n' < "$LAB_OFFLINE_MARKER")"
    [[ "$confirmation" == "$LAB_OFFLINE_CONFIRMATION" ]] || fatal "$LAB_OFFLINE_MARKER exists but does not contain the required laboratory confirmation"
    [[ -f "$LAB_NETWORK_MARKER" ]] || fatal "offline laboratory is blocked: $LAB_NETWORK_MARKER is missing; first restrict TCP+UDP ${PORT} to authorized test origins"
    network_confirmation="$(tr -d '\r\n' < "$LAB_NETWORK_MARKER")"
    [[ "$network_confirmation" == "$LAB_NETWORK_CONFIRMATION" ]] || fatal "$LAB_NETWORK_MARKER exists but does not contain the required network-restriction confirmation"
    printf 'false'
}

resolve_allow_list() {
    local online_mode="$1"
    if [[ "$online_mode" == 'false' ]]; then
        printf 'false'
    else
        printf '%s' "$CONFIGURED_ALLOW_LIST"
    fi
}

resolve_max_players() {
    local online_mode="$1" confirmation
    if [[ ! -f "$LAB_CAPACITY_MARKER" ]]; then
        printf '%s' "$CONFIGURED_MAX_PLAYERS"
        return
    fi
    [[ "$online_mode" == 'false' ]] || fatal "$LAB_CAPACITY_MARKER is permitted only while the gated OFFLINE LAB mode is active"
    confirmation="$(tr -d '\r\n' < "$LAB_CAPACITY_MARKER")"
    [[ "$confirmation" == "$LAB_CAPACITY_CONFIRMATION" ]] || fatal "$LAB_CAPACITY_MARKER exists but does not contain the required 50-client confirmation"
    printf '50'
}

validate_auth_combination() {
    local online_mode="$1" allow_list="$2"
    validate_boolean 'online-mode' "$online_mode"
    validate_boolean 'allow-list' "$allow_list"
    if [[ "$online_mode" == 'false' && "$allow_list" == 'true' ]]; then
        fatal 'BDS rejects allow-list=true when online-mode=false; refusing to modify server.properties'
    fi
}

detect_profile() {
    if [[ "$REQUESTED_PROFILE" != "auto" ]]; then
        case "$REQUESTED_PROFILE" in
            stable-shared|preview-shared) printf '%s' "$REQUESTED_PROFILE"; return ;;
            *) fatal "NATIVE_PROFILE must be auto, stable-shared, or preview-shared" ;;
        esac
    fi
    [[ -f "$GUIDE_FILE" ]] || fatal "$GUIDE_FILE is missing; cannot safely detect native NetherNet capabilities"
    if grep -q 'server-public-ip' "$GUIDE_FILE"; then
        printf 'preview-shared'
    elif grep -q 'Single shared port' "$GUIDE_FILE"; then
        printf 'stable-shared'
    else
        fatal "this BDS package does not document shared-port NetherNet; keep BEDROCK_NETWORK_MODE=legacy_proxy"
    fi
}

set_property() {
    local key="$1" value="$2" tmp
    tmp="$(mktemp "${PROPERTIES_FILE}.XXXXXX")"
    awk -v key="$key" -v value="$value" '
        BEGIN { found = 0 }
        $0 ~ "^[[:space:]]*" key "=" && $0 !~ "^[[:space:]]*#" {
            if (!found) print key "=" value
            found = 1
            next
        }
        { print }
        END { if (!found) print key "=" value }
    ' "$PROPERTIES_FILE" > "$tmp"
    mv -f "$tmp" "$PROPERTIES_FILE"
}

remove_property() {
    local key="$1" tmp
    tmp="$(mktemp "${PROPERTIES_FILE}.XXXXXX")"
    awk -v key="$key" '$0 !~ "^[[:space:]]*" key "=" || $0 ~ "^[[:space:]]*#" { print }' "$PROPERTIES_FILE" > "$tmp"
    mv -f "$tmp" "$PROPERTIES_FILE"
}

show_native_plan() {
    local profile="$1" public_ip="$2" online_mode="$3" allow_list="$4" max_players="$5" authentication='Xbox'
    [[ "$online_mode" == 'true' ]] || authentication='OFFLINE LAB'
    log "mode=native profile=${profile} BDS_VERSION=${DETECTED_VERSION} public=${public_ip}:${PORT} authentication=${authentication} allow-list=${allow_list} max-players=${max_players}"
    log "Wings must publish the primary allocation as both TCP/${PORT} and UDP/${PORT}"
    if [[ "$profile" == "stable-shared" ]]; then
        log "planned server-udp-ports=${public_ip}:${PORT}:${PORT}"
    else
        log "planned server-public-ip=${public_ip}; server-udp-ports=${PORT}"
    fi
}

configure_native() {
    local profile="$1" public_ip="$2" online_mode="$3" allow_list="$4" max_players="$5" mapped_ip="$2"
    [[ -f "$PROPERTIES_FILE" ]] || fatal "$PROPERTIES_FILE is missing"
    mkdir -p "$STATE_DIR/backups"
    if [[ ! -f "$STATE_DIR/backups/server.properties.pre-native" ]]; then
        cp -p "$PROPERTIES_FILE" "$STATE_DIR/backups/server.properties.pre-native"
    fi

    set_property server-port "$PORT"
    set_property server-ip ""
    set_property online-mode "$online_mode"
    set_property allow-list "$allow_list"
    set_property max-players "$max_players"
    set_property enable-lan-visibility false

    case "$profile" in
        stable-shared)
            set_property transport nethernet
            remove_property server-public-ip
            [[ "$mapped_ip" == *:* ]] && mapped_ip="[$mapped_ip]"
            set_property server-udp-ports "${mapped_ip}:${PORT}:${PORT}"
            ;;
        preview-shared)
            remove_property transport
            set_property server-public-ip "$public_ip"
            set_property server-udp-ports "$PORT"
            ;;
    esac
    printf '%s\n' "$profile" > "$STATE_DIR/applied-native-profile"
}

run_native() {
    validate_port "$PORT"
    validate_boolean 'ALLOW_LIST' "$CONFIGURED_ALLOW_LIST"
    validate_player_limit "$CONFIGURED_MAX_PLAYERS"
    local profile public_ip online_mode allow_list max_players
    profile="$(detect_profile)"
    public_ip="$(resolve_public_ip)"
    online_mode="$(resolve_online_mode)"
    allow_list="$(resolve_allow_list "$online_mode")"
    max_players="$(resolve_max_players "$online_mode")"
    validate_auth_combination "$online_mode" "$allow_list"
    validate_player_limit "$max_players"
    show_native_plan "$profile" "$public_ip" "$online_mode" "$allow_list" "$max_players"
    if [[ "${SUPERCORES_CHECK_ONLY:-0}" == "1" || "${1:-}" == "--check" ]]; then
        log "check-only: no files changed and no process started"
        return
    fi
    [[ -x "$BDS_EXECUTABLE" ]] || fatal "$BDS_EXECUTABLE is missing or not executable"
    configure_native "$profile" "$public_ip" "$online_mode" "$allow_list" "$max_players"
    if [[ "$online_mode" == 'true' ]]; then
        log "starting BDS directly with Xbox authentication enabled"
    else
        log "WARNING: starting network-restricted laboratory with authentication and allowlist disabled; remove $LAB_OFFLINE_MARKER, $LAB_NETWORK_MARKER and $LAB_CAPACITY_MARKER, then restart immediately after testing"
    fi
    exec env LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-.}" "$BDS_EXECUTABLE"
}

run_legacy() {
    local proxy="${PROXY_EXECUTABLE:-./bedrock-proxy-linux}"
    if [[ "${SUPERCORES_CHECK_ONLY:-0}" == "1" || "${1:-}" == "--check" ]]; then
        [[ -x "$proxy" ]] || fatal "$proxy is missing or not executable"
        log "mode=legacy_proxy executable=$proxy; check-only: no process started"
        return
    fi
    [[ -x "$proxy" ]] || fatal "$proxy is missing or not executable"
    log "starting explicit legacy proxy rollback mode"
    exec "$proxy"
}

case "$MODE" in
    native) run_native "${1:-}" ;;
    legacy_proxy) run_legacy "${1:-}" ;;
    *) fatal "BEDROCK_NETWORK_MODE must be native or legacy_proxy, got: $MODE" ;;
esac

#!/usr/bin/env bash
set -Eeuo pipefail

cd /mnt/server
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl jq unzip

channel="${BEDROCK_CHANNEL:-stable}"
version="${BEDROCK_VERSION:-latest}"
network_mode="${BEDROCK_NETWORK_MODE:-native}"
release_selector="${SUPERCORES_RELEASE:-latest}"
release_repo="${SUPERCORES_RELEASE_REPO:-CreeperFA/Pterodactyl-Egg-Bedrock-Vanilla-}"
case "$channel" in stable|preview) ;; *) echo "BEDROCK_CHANNEL must be stable or preview" >&2; exit 1 ;; esac
case "$network_mode" in native|legacy_proxy) ;; *) echo "BEDROCK_NETWORK_MODE must be native or legacy_proxy" >&2; exit 1 ;; esac
[[ "$release_selector" == latest || "$release_selector" =~ ^[A-Za-z0-9._-]+$ ]] || {
    echo "SUPERCORES_RELEASE must be latest or a release tag" >&2
    exit 1
}

work_dir="$(mktemp -d /tmp/supercores-install.XXXXXX)"
cleanup() { rm -rf "$work_dir"; }
trap cleanup EXIT

api_base="https://api.github.com/repos/${release_repo}"
curl_api() {
    curl -fsSL --retry 3 -A 'SuperCores-Bedrock-Egg' -H 'Accept: application/vnd.github+json' "$@"
}

if [[ "$release_selector" == latest ]]; then
    release_json="$(curl_api "$api_base/releases?per_page=30")"
    release_info="$(jq -cer '[.[] | select(.draft == false)] | sort_by(.published_at) | last' <<< "$release_json")" || {
        echo "No published SuperCores release was found" >&2
        exit 1
    }
else
    release_info="$(curl_api "$api_base/releases/tags/$release_selector")" || {
        echo "SuperCores release tag not found: $release_selector" >&2
        exit 1
    }
fi

release_tag="$(jq -er '.tag_name' <<< "$release_info")"
manifest_url="$(jq -er '.assets[] | select(.name == "SHA256SUMS") | .browser_download_url' <<< "$release_info")" || {
    echo "Release $release_tag does not publish SHA256SUMS" >&2
    exit 1
}
manifest_digest="$(jq -er '.assets[] | select(.name == "SHA256SUMS") | .digest' <<< "$release_info")" || {
    echo "Release $release_tag does not publish a GitHub SHA-256 digest for SHA256SUMS" >&2
    exit 1
}
[[ "$manifest_digest" == sha256:* ]] || { echo "Invalid SHA-256 digest for SHA256SUMS" >&2; exit 1; }
manifest_path="$work_dir/SHA256SUMS"
curl -fL --retry 3 -A 'SuperCores-Bedrock-Egg' -o "$manifest_path.new" "$manifest_url"
printf '%s  %s\n' "${manifest_digest#sha256:}" "$manifest_path.new" | sha256sum -c -
mv -f "$manifest_path.new" "$manifest_path"

download_release_asset() {
    local asset="$1" destination="$2" url expected
    url="$(jq -er --arg asset "$asset" '.assets[] | select(.name == $asset) | .browser_download_url' <<< "$release_info")" || {
        echo "Release $release_tag is missing asset: $asset" >&2
        exit 1
    }
    expected="$(awk -v asset="$asset" '$2 == asset { print $1; exit }' "$manifest_path")"
    [[ "$expected" =~ ^[[:xdigit:]]{64}$ ]] || {
        echo "SHA256SUMS has no valid entry for $asset" >&2
        exit 1
    }
    curl -fL --retry 3 -A 'SuperCores-Bedrock-Egg' -o "$destination.new" "$url"
    printf '%s  %s\n' "$expected" "$destination.new" | sha256sum -c -
    mv -f "$destination.new" "$destination"
}

download_release_asset 'supercores-start.sh' "$work_dir/supercores-start.sh"
if [[ "$network_mode" == legacy_proxy ]]; then
    download_release_asset 'bedrock-proxy-linux-amd64' "$work_dir/bedrock-proxy-linux"
    download_release_asset 'config.example.json' "$work_dir/config.example.json"
fi

api='https://net-secondary.web.minecraft-services.net/api/v1.0/download/links'
if [[ "$version" == latest ]]; then
    kind='serverBedrockLinux'
    [[ "$channel" == preview ]] && kind='serverBedrockPreviewLinux'
    download_url="$(curl_api "$api" | jq -er --arg kind "$kind" '.result.links[] | select(.downloadType == $kind) | .downloadUrl')"
else
    base='https://www.minecraft.net/bedrockdedicatedserver/bin-linux'
    [[ "$channel" == preview ]] && base='https://www.minecraft.net/bedrockdedicatedserver/bin-linux-preview'
    download_url="${base}/bedrock-server-${version}.zip"
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="$work_dir/bedrock-server-${stamp}.zip"
curl -fL --retry 3 -A 'Mozilla/5.0' -H 'Accept-Language: en' -o "$archive" "$download_url"
archive_sha256="$(sha256sum "$archive" | awk '{print $1}')"

# All network downloads and integrity checks complete before managed files are changed.
mkdir -p .supercores/backups
backup_dir=".supercores/backups/install-${stamp}"
mkdir -p "$backup_dir"
for item in server.properties permissions.json allowlist.json whitelist.json supercores-start.sh bedrock-proxy-linux config.json; do
    [[ ! -e "$item" ]] || cp -a "$item" "$backup_dir/"
done

# Never delete unknown files. Existing worlds, add-ons and custom files are not part of the official archive and
# therefore remain in place. Customer-owned configuration is explicitly excluded from the archive extraction.
unzip -o "$archive" -d /mnt/server \
    -x 'worlds/*' 'server.properties' 'permissions.json' 'allowlist.json' 'whitelist.json' \
       'development_behavior_packs/*' 'development_resource_packs/*'
for item in server.properties permissions.json allowlist.json; do
    [[ -e "$item" ]] || unzip -jo "$archive" "$item" -d /mnt/server
done

mv -f "$work_dir/supercores-start.sh" supercores-start.sh
chmod 0755 supercores-start.sh bedrock_server
if [[ "$network_mode" == legacy_proxy ]]; then
    mv -f "$work_dir/bedrock-proxy-linux" bedrock-proxy-linux
    chmod 0755 bedrock-proxy-linux
    [[ -e config.json ]] || cp -p "$work_dir/config.example.json" config.json
fi

resolved_version="$(basename "$download_url" | sed -n 's/^bedrock-server-\(.*\)\.zip$/\1/p')"
printf '%s\n' "$resolved_version" > .supercores/bds-version
printf '%s\n' "$download_url" > .supercores/bds-source-url
printf '%s\n' "$archive_sha256" > .supercores/bds-archive-sha256
printf '%s\n' "$release_tag" > .supercores/supercores-release

echo "Install completed: BDS ${resolved_version} (${channel}); SuperCores release ${release_tag}; archive SHA-256 ${archive_sha256}"
echo "Protected customer files were not removed. Pre-existing managed files are in ${backup_dir}."

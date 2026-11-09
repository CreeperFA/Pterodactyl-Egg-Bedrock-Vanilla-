#!/usr/bin/env bash
set -Eeuo pipefail

cd /mnt/server
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl jq unzip

channel="${BEDROCK_CHANNEL:-stable}"
version="${BEDROCK_VERSION:-latest}"
case "$channel" in stable|preview) ;; *) echo "BEDROCK_CHANNEL must be stable or preview" >&2; exit 1 ;; esac

api='https://net-secondary.web.minecraft-services.net/api/v1.0/download/links'
if [[ "$version" == "latest" ]]; then
    kind='serverBedrockLinux'
    [[ "$channel" == "preview" ]] && kind='serverBedrockPreviewLinux'
    download_url="$(curl -fsSL -A 'Mozilla/5.0' "$api" | jq -er --arg kind "$kind" '.result.links[] | select(.downloadType == $kind) | .downloadUrl')"
else
    base='https://www.minecraft.net/bedrockdedicatedserver/bin-linux'
    [[ "$channel" == "preview" ]] && base='https://www.minecraft.net/bedrockdedicatedserver/bin-linux-preview'
    download_url="${base}/bedrock-server-${version}.zip"
fi

mkdir -p .supercores/backups
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir=".supercores/backups/install-${stamp}"
mkdir -p "$backup_dir"
for item in server.properties permissions.json allowlist.json whitelist.json supercores-start.sh bedrock-proxy-linux; do
    [[ ! -e "$item" ]] || cp -a "$item" "$backup_dir/"
done

archive="/tmp/bedrock-server-${stamp}.zip"
curl -fL -A 'Mozilla/5.0' -H 'Accept-Language: en' -o "$archive" "$download_url"
archive_sha256="$(sha256sum "$archive" | awk '{print $1}')"

# Never delete unknown files. Existing worlds, add-ons and custom files are not part of the official
# archive and therefore remain in place. Customer-owned configuration is explicitly excluded.
unzip -o "$archive" -d /mnt/server \
    -x 'worlds/*' 'server.properties' 'permissions.json' 'allowlist.json' 'whitelist.json' \
       'development_behavior_packs/*' 'development_resource_packs/*'
for item in server.properties permissions.json allowlist.json; do
    [[ -e "$item" ]] || unzip -jo "$archive" "$item" -d /mnt/server
done

resolved_version="$(basename "$download_url" | sed -n 's/^bedrock-server-\(.*\)\.zip$/\1/p')"
printf '%s\n' "$resolved_version" > .supercores/bds-version
printf '%s\n' "$download_url" > .supercores/bds-source-url
printf '%s\n' "$archive_sha256" > .supercores/bds-archive-sha256

printf '%s' '__START_SCRIPT_BASE64__' | base64 -d > supercores-start.sh
chmod 0755 supercores-start.sh bedrock_server

proxy_url='https://github.com/CreeperFA/Pterodactyl-Egg-Bedrock-Vanilla-/releases/download/v1.3.0/bedrock-proxy-linux-amd64'
proxy_sha256='b7a12ad2f25997c53c599f98a9f772a1a66f744f6ce39efd200852810e0fcb48'
curl -fL -o bedrock-proxy-linux.new "$proxy_url"
printf '%s  %s\n' "$proxy_sha256" bedrock-proxy-linux.new | sha256sum -c -
mv -f bedrock-proxy-linux.new bedrock-proxy-linux
chmod 0755 bedrock-proxy-linux

if [[ ! -f config.json ]]; then
    config_url='https://github.com/CreeperFA/Pterodactyl-Egg-Bedrock-Vanilla-/releases/download/v1.3.0/config.example.json'
    config_sha256='5734b0b3eb167f1c2d61fed2e95ae5ebd19e53e00842b4c4b03845a025d42d35'
    curl -fL -o config.json "$config_url"
    printf '%s  %s\n' "$config_sha256" config.json | sha256sum -c -
fi

echo "Install completed: BDS ${resolved_version} (${channel}); archive SHA-256 ${archive_sha256}"
echo "Protected customer files were not removed. Pre-existing managed files are in ${backup_dir}."

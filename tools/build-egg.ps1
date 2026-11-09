[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$basePath = Join-Path $repo 'egg-vanilla-bedrock-proxy.json'
$outputPath = Join-Path $repo 'egg-supercores-bedrock-nethernet.json'
$installPath = Join-Path $repo 'scripts/install.sh'
$startPath = Join-Path $repo 'scripts/supercores-start.sh'

$egg = Get-Content -LiteralPath $basePath -Raw -Encoding UTF8 | ConvertFrom-Json
$install = Get-Content -LiteralPath $installPath -Raw -Encoding UTF8
$startBytes = [Text.Encoding]::UTF8.GetBytes((Get-Content -LiteralPath $startPath -Raw -Encoding UTF8).Replace("`r`n", "`n"))
$startBase64 = [Convert]::ToBase64String($startBytes)
$install = $install.Replace('__START_SCRIPT_BASE64__', $startBase64).Replace("`r`n", "`n")

$egg.exported_at = '2026-11-09T19:00:00+00:00'
$egg.name = 'SuperCores Bedrock (Native NetherNet Experimental)'
$egg.description = 'Experimental dual-mode Bedrock egg. Native mode runs supported BDS builds directly on one TCP+UDP allocation; explicit legacy_proxy mode preserves the v1.3.0 rollback. Does not migrate existing servers automatically.'
$egg.startup = 'bash ./supercores-start.sh'
$egg.config.files = @{
    'server.properties' = @{
        parser = 'properties'
        find = @{
            'server-name' = '{{server.build.env.SERVERNAME}}'
            'gamemode' = '{{server.build.env.GAMEMODE}}'
            'difficulty' = '{{server.build.env.DIFFICULTY}}'
            'allow-cheats' = '{{server.build.env.CHEATS}}'
            'max-players' = '{{server.build.env.MAX_PLAYERS}}'
            'allow-list' = '{{server.build.env.ALLOW_LIST}}'
        }
    }
} | ConvertTo-Json -Depth 10 -Compress
$egg.config.startup = @{ done = 'Server started' } | ConvertTo-Json -Compress
$egg.scripts.installation.script = $install

function New-EggVariable {
    param([string]$Name,[string]$Description,[string]$Env,[string]$Default,[bool]$View,[bool]$Edit,[string]$Rules)
    [ordered]@{ name=$Name; description=$Description; env_variable=$Env; default_value=$Default; user_viewable=$View; user_editable=$Edit; rules=$Rules; field_type='text' }
}

$egg.variables = @(
    (New-EggVariable 'Network mode' 'Explicit mode selection. Native preserves Xbox authentication; legacy_proxy is rollback only.' 'BEDROCK_NETWORK_MODE' 'native' $true $false 'required|string|in:native,legacy_proxy'),
    (New-EggVariable 'Native compatibility profile' 'auto inspects the official BDS guide. Forced profiles are for isolated diagnostics only.' 'NATIVE_PROFILE' 'auto' $false $false 'required|string|in:auto,stable-shared,preview-shared'),
    (New-EggVariable 'Public IP' 'Literal public IPv4/IPv6 receiving the primary allocation. Required when SERVER_IP is 0.0.0.0, private, or otherwise not externally reachable.' 'PUBLIC_IP' '' $true $false 'nullable|ip'),
    (New-EggVariable 'Bedrock channel' 'stable for production candidates; preview is experimental and must not be promoted without real client tests.' 'BEDROCK_CHANNEL' 'stable' $true $false 'required|string|in:stable,preview'),
    (New-EggVariable 'Bedrock version' 'latest resolves from Mojang during installation; an exact version pins the official archive.' 'BEDROCK_VERSION' 'latest' $true $true 'required|string|max:32'),
    (New-EggVariable 'Server name' 'Name displayed by Bedrock Dedicated Server.' 'SERVERNAME' 'Bedrock Dedicated Server' $true $true 'required|string|max:50'),
    (New-EggVariable 'Gamemode' 'Default game mode.' 'GAMEMODE' 'survival' $true $true 'required|string|in:survival,creative,adventure'),
    (New-EggVariable 'Difficulty' 'World difficulty.' 'DIFFICULTY' 'easy' $true $true 'required|string|in:peaceful,easy,normal,hard'),
    (New-EggVariable 'Allow cheats' 'Whether commands and cheats are enabled.' 'CHEATS' 'false' $true $true 'required|string|in:true,false'),
    (New-EggVariable 'Max players' 'Maximum concurrent players.' 'MAX_PLAYERS' '10' $true $true 'required|integer|min:1|max:200'),
    (New-EggVariable 'Allow list' 'Require players to be present in allowlist.json.' 'ALLOW_LIST' 'false' $true $true 'required|string|in:true,false'),
    (New-EggVariable 'LD library path' 'Required by the official Linux BDS binary.' 'LD_LIBRARY_PATH' '.' $false $false 'required|string|max:64'),
    (New-EggVariable 'BDS executable' 'Official Bedrock Dedicated Server executable.' 'EXECUTABLE' './bedrock_server' $false $false 'required|string|max:128'),
    (New-EggVariable 'Legacy backend port' 'Internal-only port used exclusively by legacy_proxy. Never allocate it publicly.' 'BACKEND_PORT' '19140' $false $false 'required|integer|min:1|max:65535'),
    (New-EggVariable 'TURN relay URLs' 'Optional legacy proxy TURN fallback. Values are not true secrets because container processes can read environment variables.' 'TURN_URLS' '' $false $false 'nullable|string|max:1000'),
    (New-EggVariable 'TURN username' 'Optional legacy proxy TURN username.' 'TURN_USERNAME' '' $false $false 'nullable|string|max:255'),
    (New-EggVariable 'TURN password' 'Optional legacy proxy TURN password; environment variables are not a secure secret store.' 'TURN_PASSWORD' '' $false $false 'nullable|string|max:255')
)

$json = $egg | ConvertTo-Json -Depth 30
[IO.File]::WriteAllText($outputPath, $json + "`n", [Text.UTF8Encoding]::new($false))
Write-Host "Generated $outputPath"

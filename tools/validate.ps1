[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$eggPath = Join-Path $repo 'egg-supercores-bedrock-nethernet.json'
$startScript = Join-Path $repo 'scripts/supercores-start.sh'
$installScript = Join-Path $repo 'scripts/install.sh'
$bash = 'C:\Program Files\Git\bin\bash.exe'
if (-not (Test-Path -LiteralPath $bash)) { throw 'Git Bash is required for local shell validation.' }

& $bash -n $startScript
if ($LASTEXITCODE) { throw 'supercores-start.sh failed bash -n' }
& $bash -n $installScript
if ($LASTEXITCODE) { throw 'install.sh failed bash -n' }

$egg = Get-Content -LiteralPath $eggPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($egg.meta.version -ne 'PTDL_v2') { throw 'Egg is not PTDL_v2.' }
if ($egg.startup -ne 'bash ./supercores-start.sh') { throw 'Unexpected startup command.' }
if ($egg.scripts.installation.script.Contains('__START_SCRIPT_BASE64__')) { throw 'Unexpanded installer token.' }
$encodedMatch = [regex]::Match($egg.scripts.installation.script, "printf '%s' '([A-Za-z0-9+/=]+)' \| base64 -d > supercores-start[.]sh")
if (-not $encodedMatch.Success) { throw 'Embedded startup script was not found in the installer.' }
$embeddedStart = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encodedMatch.Groups[1].Value))
$sourceStart = (Get-Content -LiteralPath $startScript -Raw -Encoding UTF8).Replace("`r`n", "`n")
if ($embeddedStart -ne $sourceStart) { throw 'Embedded startup script differs from scripts/supercores-start.sh.' }
$names = @($egg.variables.env_variable)
foreach ($required in 'BEDROCK_NETWORK_MODE','NATIVE_PROFILE','PUBLIC_IP','BEDROCK_CHANNEL','BEDROCK_VERSION','ALLOW_LIST','BACKEND_PORT') {
    if ($required -notin $names) { throw "Missing egg variable $required" }
}

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('supercores-native-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
    function Invoke-ProfileTest {
        param([string]$Name,[string]$Guide,[string]$ExpectedUdp,[string]$ExpectedPublic,[bool]$ExpectTransport)
        $dir = Join-Path $tempRoot $Name
        New-Item -ItemType Directory -Path $dir | Out-Null
        Copy-Item -LiteralPath $startScript -Destination (Join-Path $dir 'supercores-start.sh')
        [IO.File]::WriteAllText((Join-Path $dir 'bedrock_server_how_to.html'), $Guide, [Text.UTF8Encoding]::new($false))
        [IO.File]::WriteAllText((Join-Path $dir 'server.properties'), "server-name=fixture`ntransport=raknet`nonline-mode=false`nserver-public-ip=old`nserver-udp-ports=30000-30010`n", [Text.UTF8Encoding]::new($false))
        [IO.File]::WriteAllText((Join-Path $dir 'dummy-bds'), "#!/usr/bin/env bash`nexit 0`n", [Text.UTF8Encoding]::new($false))
        Push-Location $dir
        try {
            & $bash -c 'chmod +x ./supercores-start.sh ./dummy-bds && env BEDROCK_NETWORK_MODE=native NATIVE_PROFILE=auto PUBLIC_IP=203.0.113.10 SERVER_IP=0.0.0.0 SERVER_PORT=24567 EXECUTABLE=./dummy-bds ./supercores-start.sh'
            if ($LASTEXITCODE) { throw "$Name profile execution failed" }
        } finally { Pop-Location }
        $properties = Get-Content -LiteralPath (Join-Path $dir 'server.properties') -Raw
        if ($properties -notmatch "(?m)^server-udp-ports=$([regex]::Escape($ExpectedUdp))$") { throw "$Name UDP mapping mismatch" }
        if ($ExpectedPublic -and $properties -notmatch "(?m)^server-public-ip=$([regex]::Escape($ExpectedPublic))$") { throw "$Name public IP mismatch" }
        if (-not $ExpectedPublic -and $properties -match '(?m)^server-public-ip=') { throw "$Name retained unsupported server-public-ip" }
        $hasTransport = $properties -match '(?m)^transport=nethernet$'
        if ($hasTransport -ne $ExpectTransport) { throw "$Name transport property mismatch" }
        if (-not (Test-Path -LiteralPath (Join-Path $dir '.supercores/backups/server.properties.pre-native'))) { throw "$Name did not create rollback backup" }
    }

    Invoke-ProfileTest -Name stable -Guide '<h3>Single shared port</h3>' -ExpectedUdp '203.0.113.10:24567:24567' -ExpectedPublic '' -ExpectTransport $true
    Invoke-ProfileTest -Name preview -Guide '<code>server-public-ip</code>' -ExpectedUdp '24567' -ExpectedPublic '203.0.113.10' -ExpectTransport $false

    $labDir = Join-Path $tempRoot 'stable'
    $marker = Join-Path $labDir '.supercores/lab-offline-approved'
    $networkMarker = Join-Path $labDir '.supercores/lab-network-restriction-approved'
    [IO.File]::WriteAllText($marker, 'I_ACKNOWLEDGE_THIS_IS_AN_ISOLATED_OFFLINE_LAB', [Text.Encoding]::ASCII)
    $beforeBlocked = (Get-FileHash -LiteralPath (Join-Path $labDir 'server.properties')).Hash
    Push-Location $labDir
    try {
        & $bash -c 'env BEDROCK_NETWORK_MODE=native NATIVE_PROFILE=auto PUBLIC_IP=203.0.113.10 SERVER_PORT=24567 EXECUTABLE=./dummy-bds ./supercores-start.sh'
        if ($LASTEXITCODE -eq 0) { throw 'offline laboratory started without the network-restriction gate' }
    } finally { Pop-Location }
    $afterBlocked = (Get-FileHash -LiteralPath (Join-Path $labDir 'server.properties')).Hash
    if ($beforeBlocked -ne $afterBlocked) { throw 'blocked offline preflight modified server.properties' }

    [IO.File]::WriteAllText($networkMarker, 'I_CONFIRM_NETWORK_ACCESS_IS_RESTRICTED_TO_AUTHORIZED_TEST_ORIGINS', [Text.Encoding]::ASCII)
    Push-Location $labDir
    try {
        & $bash -c 'env BEDROCK_NETWORK_MODE=native NATIVE_PROFILE=auto PUBLIC_IP=203.0.113.10 SERVER_PORT=24567 EXECUTABLE=./dummy-bds ./supercores-start.sh'
        if ($LASTEXITCODE) { throw 'offline laboratory profile execution failed' }
    } finally { Pop-Location }
    $offlineProperties = Get-Content -LiteralPath (Join-Path $labDir 'server.properties') -Raw
    if ($offlineProperties -notmatch '(?m)^online-mode=false$') { throw 'offline laboratory marker did not disable online-mode' }
    if ($offlineProperties -notmatch '(?m)^allow-list=false$') { throw 'offline laboratory did not disable the BDS-incompatible allowlist' }

    Remove-Item -LiteralPath $marker,$networkMarker -Force
    Push-Location $labDir
    try {
        & $bash -c 'env BEDROCK_NETWORK_MODE=native NATIVE_PROFILE=auto PUBLIC_IP=203.0.113.10 SERVER_PORT=24567 ALLOW_LIST=true EXECUTABLE=./dummy-bds ./supercores-start.sh'
        if ($LASTEXITCODE) { throw 'Xbox restoration execution failed' }
    } finally { Pop-Location }
    $restoredProperties = Get-Content -LiteralPath (Join-Path $labDir 'server.properties') -Raw
    if ($restoredProperties -notmatch '(?m)^online-mode=true$') { throw 'removing laboratory marker did not restore online-mode=true' }
    if ($restoredProperties -notmatch '(?m)^allow-list=true$') { throw 'removing laboratory markers did not restore configured allow-list=true' }

    $checkDir = Join-Path $tempRoot 'check-only'
    Copy-Item -Recurse -LiteralPath (Join-Path $tempRoot 'stable') -Destination $checkDir
    $before = (Get-FileHash -LiteralPath (Join-Path $checkDir 'server.properties')).Hash
    Push-Location $checkDir
    try {
        & $bash -c 'env BEDROCK_NETWORK_MODE=native NATIVE_PROFILE=auto PUBLIC_IP=203.0.113.10 SERVER_PORT=24567 SUPERCORES_CHECK_ONLY=1 ./supercores-start.sh'
        if ($LASTEXITCODE) { throw 'check-only failed' }
    } finally { Pop-Location }
    $after = (Get-FileHash -LiteralPath (Join-Path $checkDir 'server.properties')).Hash
    if ($before -ne $after) { throw 'check-only modified server.properties' }
} finally {
    if ((Resolve-Path -LiteralPath $tempRoot).Path.StartsWith([IO.Path]::GetTempPath(), [StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}

Write-Host 'Validation passed: egg JSON, shell syntax, stable/preview profiles, gated offline false/false, Xbox true/true restoration, rollback backup, and check-only behavior.'

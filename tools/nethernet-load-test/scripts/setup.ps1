$ErrorActionPreference = 'Stop'
$BedbooCommit = '254bfcc4d05ddad767ac95e6208f6e1942dea8f3'
$ToolRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$RuntimeRoot = Join-Path $ToolRoot '.runtime'
$BedbooRoot = Join-Path $RuntimeRoot 'bedboo'
$PackageRoot = Join-Path $BedbooRoot '.supercores-tools\nethernet-load-test'

if ((node --version) -notmatch '^v(2[4-9]|[3-9][0-9])\.') {
    throw 'Node.js 24 or newer is required.'
}

New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null
if (-not (Test-Path (Join-Path $BedbooRoot '.git'))) {
    git clone https://github.com/LiteLDev/bedboo.git $BedbooRoot
}
git -C $BedbooRoot fetch --depth 1 origin $BedbooCommit
git -C $BedbooRoot checkout --detach $BedbooCommit

New-Item -ItemType Directory -Force -Path $PackageRoot | Out-Null
Get-ChildItem -LiteralPath $ToolRoot -Force |
    Where-Object { $_.Name -notin @('.runtime', 'config.json') } |
    Copy-Item -Destination $PackageRoot -Recurse -Force

Push-Location $BedbooRoot
try {
    npx --yes pnpm@12.14.0 install --frozen-lockfile
} finally {
    Pop-Location
}

Write-Host "Prepared pinned bedboo runtime at $BedbooRoot"

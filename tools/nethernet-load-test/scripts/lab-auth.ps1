[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('offline', 'xbox')]
    [string]$Mode,

    [string]$ServerDirectory = '.'
)

$ErrorActionPreference = 'Stop'
$serverRoot = (Resolve-Path -LiteralPath $ServerDirectory).Path
$stateDirectory = Join-Path $serverRoot '.supercores'
$marker = Join-Path $stateDirectory 'lab-offline-approved'
$confirmation = 'I_ACKNOWLEDGE_THIS_IS_AN_ISOLATED_OFFLINE_LAB'

if ($Mode -eq 'offline') {
    New-Item -ItemType Directory -Force -Path $stateDirectory | Out-Null
    Set-Content -LiteralPath $marker -Value $confirmation -Encoding ascii -NoNewline
    Write-Host "Offline laboratory marker enabled at $marker. Restart the laboratory server to apply it."
    Write-Warning 'Restrict access while online-mode is disabled.'
} else {
    if (Test-Path -LiteralPath $marker) {
        Remove-Item -LiteralPath $marker -Force
    }
    Write-Host "Xbox mode selected. Restart the laboratory server; startup will enforce online-mode=true."
}

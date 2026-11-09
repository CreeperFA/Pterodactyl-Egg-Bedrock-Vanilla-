[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('offline', 'xbox')]
    [string]$Mode,

    [string]$ServerDirectory = '.',

    [switch]$NetworkRestrictionConfirmed,

    [string]$AuthorizedOrigins
)

$ErrorActionPreference = 'Stop'
$serverRoot = (Resolve-Path -LiteralPath $ServerDirectory).Path
$stateDirectory = Join-Path $serverRoot '.supercores'
$marker = Join-Path $stateDirectory 'lab-offline-approved'
$confirmation = 'I_ACKNOWLEDGE_THIS_IS_AN_ISOLATED_OFFLINE_LAB'
$networkMarker = Join-Path $stateDirectory 'lab-network-restriction-approved'
$networkConfirmation = 'I_CONFIRM_NETWORK_ACCESS_IS_RESTRICTED_TO_AUTHORIZED_TEST_ORIGINS'
$networkDetails = Join-Path $stateDirectory 'lab-network-restriction-details.txt'

if ($Mode -eq 'offline') {
    if (-not $NetworkRestrictionConfirmed -or [string]::IsNullOrWhiteSpace($AuthorizedOrigins)) {
        throw 'Offline mode requires -NetworkRestrictionConfirmed and a non-empty -AuthorizedOrigins description after an external TCP+UDP restriction has been verified.'
    }
    New-Item -ItemType Directory -Force -Path $stateDirectory | Out-Null
    Set-Content -LiteralPath $marker -Value $confirmation -Encoding ascii -NoNewline
    Set-Content -LiteralPath $networkMarker -Value $networkConfirmation -Encoding ascii -NoNewline
    Set-Content -LiteralPath $networkDetails -Value ("Authorized origins: {0}`nConfirmed UTC: {1:O}" -f $AuthorizedOrigins, [DateTime]::UtcNow) -Encoding utf8
    Write-Host "Offline laboratory gates enabled. Restart applies online-mode=false and allow-list=false."
    Write-Warning 'These files only attest an already-applied external restriction; they do not modify firewall, Wings, Docker, or provider ACLs.'
} else {
    foreach ($path in @($marker, $networkMarker, $networkDetails)) {
        if (Test-Path -LiteralPath $path) {
            Remove-Item -LiteralPath $path -Force
        }
    }
    Write-Host "Xbox mode selected. Restart the laboratory server; startup will enforce online-mode=true and restore the configured ALLOW_LIST value."
}

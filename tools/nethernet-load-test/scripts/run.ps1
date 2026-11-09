param(
    [string]$Config = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'config.json'),
    [string]$Scenario = ''
)
$ErrorActionPreference = 'Stop'
$ToolRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Runner = Join-Path $ToolRoot '.runtime\bedboo\.supercores-tools\nethernet-load-test\src\cli.js'
if (-not (Test-Path $Runner)) {
    & (Join-Path $PSScriptRoot 'setup.ps1')
}
$Arguments = @($Runner, '--config', (Resolve-Path $Config).Path)
if ($Scenario) { $Arguments += @('--scenario', $Scenario) }
node @Arguments

param(
    [string]$Config = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'config.json'),
    [ValidateSet('', 'basic', 'medium', 'high', 'maximum')]
    [string]$Scenario = '',
    [switch]$Suite,
    [switch]$Check
)
$ErrorActionPreference = 'Stop'
$ToolRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Runner = Join-Path $ToolRoot '.runtime\bedboo\.supercores-tools\nethernet-load-test\src\cli.js'
if (-not (Test-Path $Runner)) {
    & (Join-Path $PSScriptRoot 'setup.ps1')
}
$Arguments = @($Runner, '--config', (Resolve-Path $Config).Path)
if ($Suite -and $Scenario) { throw '-Suite and -Scenario are mutually exclusive.' }
if ($Scenario) { $Arguments += @('--scenario', $Scenario) }
if ($Suite) { $Arguments += '--suite' }
if ($Check) { $Arguments += '--check' }
node @Arguments

[CmdletBinding()]
param(
    [Parameter(Mandatory)][uri]$PanelUrl,
    [Parameter(Mandatory)][string]$ApiKey,
    [Parameter(Mandatory)][int]$SourceEggId,
    [Parameter(Mandatory)][int]$TargetEggId,
    [string]$OutputPath = '.\migration-plan.json'
)

$ErrorActionPreference = 'Stop'
$headers = @{
    Authorization = "Bearer $ApiKey"
    Accept = 'Application/vnd.pterodactyl.v1+json'
    'Content-Type' = 'application/json'
}
$base = $PanelUrl.AbsoluteUri.TrimEnd('/')
$page = 1
$matches = @()
do {
    $uri = "$base/api/application/servers?include=egg,node,allocations,variables&per_page=100&page=$page"
    $response = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
    foreach ($entry in $response.data) {
        $a = $entry.attributes
        $eggRelationship = $entry.relationships.egg.data.attributes
        $eggId = if ($eggRelationship.id) { [int]$eggRelationship.id } elseif ($a.egg) { [int]$a.egg } else { 0 }
        if ($eggId -ne $SourceEggId) { continue }
        $matches += [ordered]@{
            id = $a.id
            uuid = $a.uuid
            name = $a.name
            node = $entry.relationships.node.data.attributes.name
            current_egg_id = $eggId
            target_egg_id = $TargetEggId
            primary_allocation = $a.allocation
            proposed_mode = 'legacy_proxy'
            requires_file_precheck = @('supercores-start.sh','bedrock-proxy-linux','config.json','server.properties')
            requires_backup = @('worlds/','server.properties','permissions.json','allowlist.json','resource_packs/','behavior_packs/')
            proposed_startup = 'bash ./supercores-start.sh'
            automatic_action_performed = $false
        }
    }
    $totalPages = [int]$response.meta.pagination.total_pages
    $page++
} while ($page -le $totalPages)

$plan = [ordered]@{
    generated_at = [DateTimeOffset]::UtcNow.ToString('o')
    panel = $base
    source_egg_id = $SourceEggId
    target_egg_id = $TargetEggId
    mode = 'dry-run-only'
    warning = 'This tool never PATCHes servers, never reinstalls, and never changes allocations. Prepare files and backups, then review each server manually.'
    servers = $matches
}
[IO.File]::WriteAllText((Join-Path (Get-Location) $OutputPath), ($plan | ConvertTo-Json -Depth 20) + "`n", [Text.UTF8Encoding]::new($false))
Write-Host "Dry-run plan written to $OutputPath for $($matches.Count) server(s). No server was modified."

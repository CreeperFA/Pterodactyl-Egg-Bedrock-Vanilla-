'use strict'

const fs = require('fs')
const path = require('path')

function csvCell (value) {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function clientCsv (clients) {
  const fields = [
    'id', 'username', 'auth_mode', 'started_at', 'connected_at', 'login_at', 'spawned_at', 'ended_at',
    'time_to_spawn_ms', 'session_duration_ms', 'auth_result', 'ice_state', 'connection_state',
    'latency_ms_last', 'latency_ms_average', 'simultaneous_hold_seconds', 'disconnect_reason', 'error_count'
  ]
  const lines = [fields.join(',')]
  for (const client of clients) {
    const latency = client.latencySamplesMs || []
    const average = latency.length ? Math.round((latency.reduce((sum, item) => sum + item, 0) / latency.length) * 100) / 100 : null
    const row = {
      id: client.id,
      username: client.username,
      auth_mode: client.authMode,
      started_at: client.startedAt,
      connected_at: client.connectedAt,
      login_at: client.loginAt,
      spawned_at: client.spawnedAt,
      ended_at: client.endedAt,
      time_to_spawn_ms: client.timeToSpawnMs,
      session_duration_ms: client.sessionDurationMs,
      auth_result: client.authentication?.result,
      ice_state: client.ice?.iceConnectionState,
      connection_state: client.ice?.connectionState,
      latency_ms_last: latency.at(-1),
      latency_ms_average: average,
      simultaneous_hold_seconds: client.simultaneousHoldSeconds,
      disconnect_reason: client.disconnectReason,
      error_count: client.errors?.length || 0
    }
    lines.push(fields.map(field => csvCell(row[field])).join(','))
  }
  return lines.join('\n') + '\n'
}

function reportMarkdown (result) {
  const limitations = result.limitations.map(item => `- ${item}`).join('\n')
  const errors = result.errors.length
    ? result.errors.map(item => `- ${item.at} — ${item.clientId || 'run'} — **${item.category}**: ${item.message}`).join('\n')
    : '- No se registraron errores.'
  const metrics = result.laboratoryMetrics || { enabled: false, source: 'not configured', samples: [], stopReason: null }
  return `# Informe de prueba NetherNet

Estado: **${result.status}**

${result.summary}

## Entorno

| Campo | Valor |
|---|---|
| Run ID | \`${result.runId}\` |
| Inicio | ${result.startedAt} |
| Fin | ${result.completedAt} |
| Destino | \`${result.target.host}:${result.target.port}\` |
| BDS declarado | \`${result.target.bdsVersion}\` |
| Transporte | \`${result.target.transport}\` |
| bedboo | \`${result.library.name} ${result.library.version}\` (commit \`${result.library.commit}\`) |
| Autenticación | \`${result.authMode}\` |
| Escenario | \`${result.scenario.name}\` |
| Bots solicitados | ${result.scenario.clients} |
| Bots que ingresaron al mundo | ${result.metrics.spawnedClients} |
| Máximo simultáneo | ${result.metrics.maximumSimultaneous} |
| Permanencia simultánea requerida | ${result.scenario.durationSeconds} s |
| Permanencia simultánea lograda | ${result.metrics.simultaneousHoldSeconds} s |

## Señalización y sesiones

- Señalización TCP \`GET /v1/join\`: ${result.preflight?.tcpSignalingReachable ? `alcanzable (HTTP ${result.preflight.status})` : 'no confirmada'}.
- Ingreso al mundo se cuenta únicamente al recibir el evento \`spawn\` posterior a \`StartGame\`.
- Estado ICE final por cliente y latencia disponible: ver \`connections.csv\` y \`results.json\`.
- Prueba de puerto UDP único: ${result.portVerification.udpSharedPortObserved ? 'observada' : 'no inspeccionada directamente'}.
- Puertos adicionales por jugador: ${result.portVerification.additionalPortsInspected ? 'inspeccionados' : 'no inspeccionados'}.

## Métricas del laboratorio

- Fuente autorizada: ${metrics.enabled ? `\`${metrics.source}\`` : 'no configurada'}.
- Muestras recibidas: ${metrics.samples.length}.
- Parada de seguridad: ${metrics.stopReason || 'no activada'}.
- CPU, RAM, red, jugadores, TPS/MSPT y errores sólo aparecen en \`results.json\` cuando la fuente proporcionada por el operador los entrega; no se estiman valores ausentes.

## Errores

${errors}

## Limitaciones

${limitations}

## Criterio

- **PASS:** todos ingresaron al mundo y permanecieron conectados simultáneamente durante el período requerido.
- **PARTIAL:** ingresó al menos uno, pero no se alcanzó el objetivo completo.
- **FAIL:** nadie completó el ingreso o las sesiones no pudieron mantenerse.
- **NOT TESTED:** no se realizó una conexión real.

${result.authMode === 'offline' ? '> Un PASS offline no certifica autenticación Microsoft/Xbox ni convierte el Egg en estable.\n' : ''}`
}

function writeReports (result, baseDirectory) {
  const runDirectory = path.resolve(baseDirectory, result.runId)
  fs.mkdirSync(runDirectory, { recursive: true })
  fs.writeFileSync(path.join(runDirectory, 'results.json'), JSON.stringify(result, null, 2) + '\n')
  fs.writeFileSync(path.join(runDirectory, 'connections.csv'), clientCsv(result.clients))
  fs.writeFileSync(path.join(runDirectory, 'REPORT.md'), reportMarkdown(result))
  const errorLog = result.errors.map(item => `${item.at}\t${item.clientId || 'run'}\t${item.category}\t${item.message}`).join('\n')
  fs.writeFileSync(path.join(runDirectory, 'errors.log'), errorLog ? errorLog + '\n' : '')
  return runDirectory
}

function consolidatedMarkdown (suite) {
  const rows = suite.scenarios.map(item => `| ${item.clients} | ${item.spawnedClients ?? 'Pendiente'} | ${item.maximumSimultaneous ?? 'Pendiente'} | ${item.simultaneousHoldSeconds ?? 'Pendiente'} s | ${item.status} |`).join('\n')
  const errors = suite.errors?.length ? `\n## Bloqueos o interrupciones\n\n${suite.errors.map(item => `- ${item.scenario}: ${item.message}`).join('\n')}\n` : ''
  return `# Informe consolidado NetherNet

Estado: **${suite.status}**

Inicio: ${suite.startedAt}

Fin: ${suite.completedAt}

| Bots | Spawn confirmados | Máximo simultáneo | Permanencia | Resultado |
|---:|---:|---:|---:|---|
${rows}

Los escenarios se ejecutan en orden. Un escenario posterior sólo puede comenzar si el anterior termina en PASS. Los valores pendientes no representan conexiones reales.
${errors}
`
}

function writeConsolidatedReport (suite, baseDirectory) {
  const directory = path.resolve(baseDirectory, suite.runId)
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(suite, null, 2) + '\n')
  fs.writeFileSync(path.join(directory, 'REPORT.md'), consolidatedMarkdown(suite))
  return directory
}

module.exports = { clientCsv, consolidatedMarkdown, reportMarkdown, writeConsolidatedReport, writeReports }

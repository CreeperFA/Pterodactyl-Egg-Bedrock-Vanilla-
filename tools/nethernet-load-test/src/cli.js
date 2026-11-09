#!/usr/bin/env node
'use strict'

const path = require('path')
const { loadConfig } = require('./config')
const { runTest, BEDBOO_COMMIT, runId } = require('./runner')
const { writeReports } = require('./reporter')

function parseArgs (argv) {
  const parsed = { config: 'config.json', scenario: null, checkOnly: false }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--check') parsed.checkOnly = true
    else if (arg === '--config') parsed.config = argv[++index]
    else if (arg === '--scenario') parsed.scenario = argv[++index]
    else if (arg === '--help' || arg === '-h') parsed.help = true
    else throw new Error(`unknown argument: ${arg}`)
  }
  return parsed
}

function notTestedResult (config) {
  const timestamp = new Date().toISOString()
  return {
    schemaVersion: 1,
    runId: `${runId()}-NOT-TESTED`,
    status: 'NOT TESTED',
    summary: 'NOT TESTED: configuración validada localmente; no se abrió ninguna conexión de red.',
    startedAt: timestamp,
    completedAt: timestamp,
    target: config.target,
    library: { name: 'bedboo', version: '0.0.0', commit: BEDBOO_COMMIT },
    authMode: config.auth.mode,
    scenario: config.scenario,
    preflight: null,
    metrics: { spawnedClients: 0, maximumSimultaneous: 0, simultaneousHoldSeconds: 0 },
    clients: [],
    errors: [],
    aborted: false,
    portVerification: { tcpSharedPortProbed: false, udpSharedPortObserved: false, additionalPortsInspected: false },
    limitations: [
      'No se ejecutaron conexiones reales.',
      'No se validaron credenciales Microsoft/Xbox.',
      'No se inspeccionaron TCP, UDP, ICE ni puertos del nodo.'
    ]
  }
}

async function main () {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('Usage: node src/cli.js --config config.json [--scenario basic|multiplex|medium|expanded] [--check]')
    return
  }
  if (!args.config) throw new Error('--config needs a file path')
  const loaded = loadConfig(args.config, { scenario: args.scenario, checkOnly: args.checkOnly })
  const reportBase = path.isAbsolute(loaded.config.reportDirectory)
    ? loaded.config.reportDirectory
    : path.resolve(path.dirname(loaded.file), loaded.config.reportDirectory)

  if (args.checkOnly) {
    const result = notTestedResult(loaded.config)
    const directory = writeReports(result, reportBase)
    console.log(`Configuration valid. No network connection was attempted. Report: ${directory}`)
    return
  }

  const controller = new AbortController()
  let stopping = false
  const stop = signalName => {
    if (stopping) return
    stopping = true
    console.error(`${signalName}: stopping every test session...`)
    controller.abort(new Error(`operator requested stop (${signalName})`))
  }
  process.once('SIGINT', () => stop('SIGINT'))
  process.once('SIGTERM', () => stop('SIGTERM'))

  const result = await runTest(loaded.config, { signal: controller.signal })
  const directory = writeReports(result, reportBase)
  console.log(`${result.status}: ${result.summary}`)
  console.log(`Reports: ${directory}`)
  if (result.status !== 'PASS') process.exitCode = 1
}

main().catch(error => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})

module.exports = { main, notTestedResult, parseArgs }

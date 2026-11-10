#!/usr/bin/env node
'use strict'

const path = require('path')
const { SCENARIO_ORDER, loadConfig } = require('./config')
const { runTest, BEDBOO_COMMIT, runId, sleep } = require('./runner')
const { writeConsolidatedReport, writeReports } = require('./reporter')

function parseArgs (argv) {
  const parsed = { config: 'config.json', scenario: null, checkOnly: false, suite: false }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--check') parsed.checkOnly = true
    else if (arg === '--suite') parsed.suite = true
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

function suiteItem (scenarioName, result = null, reportDirectory = null) {
  return {
    scenario: scenarioName,
    clients: result?.scenario.clients ?? null,
    spawnedClients: result?.metrics.spawnedClients ?? null,
    maximumSimultaneous: result?.metrics.maximumSimultaneous ?? null,
    simultaneousHoldSeconds: result?.metrics.simultaneousHoldSeconds ?? null,
    status: result?.status ?? 'NOT TESTED',
    reportDirectory
  }
}

async function runSuite (configFile, options) {
  const runTestFn = options.runTest || runTest
  const sleepFn = options.sleep || sleep
  const suiteRunId = `${runId()}-suite`
  const startedAt = new Date().toISOString()
  const scenarios = []
  const errors = []
  let reportBase
  let stopped = false

  for (const scenarioName of SCENARIO_ORDER) {
    if (stopped) {
      const preview = loadConfig(configFile, { scenario: scenarioName, checkOnly: true }).config
      reportBase = path.isAbsolute(preview.reportDirectory)
        ? preview.reportDirectory
        : path.resolve(path.dirname(path.resolve(configFile)), preview.reportDirectory)
      const result = notTestedResult(preview)
      result.runId = `${suiteRunId}-${scenarioName}`
      result.summary = 'NOT TESTED: etapa no iniciada porque una etapa anterior falló, fue bloqueada o se interrumpió.'
      const directory = writeReports(result, reportBase)
      scenarios.push(suiteItem(scenarioName, result, directory))
      continue
    }

    let loaded
    try {
      loaded = loadConfig(configFile, { scenario: scenarioName, checkOnly: options.checkOnly })
    } catch (error) {
      if (options.checkOnly) throw error
      loaded = loadConfig(configFile, { scenario: scenarioName, checkOnly: true })
      reportBase = path.isAbsolute(loaded.config.reportDirectory)
        ? loaded.config.reportDirectory
        : path.resolve(path.dirname(loaded.file), loaded.config.reportDirectory)
      const result = notTestedResult(loaded.config)
      result.runId = `${suiteRunId}-${scenarioName}`
      result.summary = `NOT TESTED: etapa bloqueada por seguridad: ${error.message}`
      result.errors.push({ at: new Date().toISOString(), clientId: null, category: 'authorization', message: error.message })
      const directory = writeReports(result, reportBase)
      scenarios.push(suiteItem(scenarioName, result, directory))
      errors.push({ scenario: scenarioName, message: error.message })
      stopped = true
      continue
    }
    reportBase = path.isAbsolute(loaded.config.reportDirectory)
      ? loaded.config.reportDirectory
      : path.resolve(path.dirname(loaded.file), loaded.config.reportDirectory)
    const result = options.checkOnly ? notTestedResult(loaded.config) : await runTestFn(loaded.config, { signal: options.signal })
    result.runId = `${suiteRunId}-${scenarioName}`
    const directory = writeReports(result, reportBase)
    scenarios.push(suiteItem(scenarioName, result, directory))
    stopped = !options.checkOnly && result.status !== 'PASS'
    if (!stopped && !options.checkOnly && scenarioName !== SCENARIO_ORDER.at(-1)) {
      console.log(`Recovery pause: ${loaded.config.recoverySeconds}s before validating the next scenario and its capacity approval.`)
      try {
        await sleepFn(loaded.config.recoverySeconds * 1000, options.signal)
      } catch (error) {
        errors.push({ scenario: scenarioName, message: error.message })
        stopped = true
      }
    }
  }

  const statuses = scenarios.map(item => item.status)
  const status = options.checkOnly ? 'NOT TESTED' : statuses.every(item => item === 'PASS') ? 'PASS' : statuses.some(item => item === 'PASS') ? 'PARTIAL' : 'FAIL'
  const suite = { schemaVersion: 1, runId: suiteRunId, status, startedAt, completedAt: new Date().toISOString(), scenarios, errors }
  const directory = writeConsolidatedReport(suite, reportBase)
  return { suite, directory }
}

async function main () {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('Usage: node src/cli.js --config config.json [--scenario basic|medium|high|maximum | --suite] [--check]')
    return
  }
  if (args.suite && args.scenario) throw new Error('--suite and --scenario are mutually exclusive')
  if (!args.config) throw new Error('--config needs a file path')
  if (args.suite) {
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
    const output = await runSuite(args.config, { checkOnly: args.checkOnly, signal: controller.signal })
    console.log(`${output.suite.status}: consolidated report: ${output.directory}`)
    if (!args.checkOnly && output.suite.status !== 'PASS') process.exitCode = 1
    return
  }

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

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message)
    process.exitCode = 1
  })
}

module.exports = { main, notTestedResult, parseArgs, runSuite, suiteItem }

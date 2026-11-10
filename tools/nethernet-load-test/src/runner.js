'use strict'

const fs = require('fs')
const { createSession } = require('./session')
const { preflight } = require('./preflight')

const BEDBOO_COMMIT = '254bfcc4d05ddad767ac95e6208f6e1942dea8f3'

function sleep (milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds)
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(signal.reason || new Error('aborted'))
      }, { once: true })
    }
  })
}

function abortPromise (signal) {
  if (!signal) return new Promise(() => {})
  if (signal.aborted) return Promise.reject(signal.reason || new Error('aborted'))
  return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason || new Error('aborted')), { once: true }))
}

function runId (date = new Date()) {
  return date.toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z')
}

function createContinuousHoldTracker (requiredClients, startedAt) {
  let continuous = true
  let heldUntil = startedAt
  return {
    sample (activeClients, at) {
      if (!continuous) return
      if (activeClients !== requiredClients) {
        continuous = false
        return
      }
      heldUntil = at
    },
    seconds () {
      return Math.max(0, Math.floor((heldUntil - startedAt) / 1000))
    },
    isContinuous () {
      return continuous
    }
  }
}

function readMetricsFile (file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function healthFailure (sample, thresholds) {
  if (sample.processRunning === false || sample.serverAvailable === false) return 'laboratory server became unavailable'
  if (typeof sample.cpuPercent === 'number' && sample.cpuPercent >= thresholds.cpuPercent) return `CPU reached ${sample.cpuPercent}% (stop threshold ${thresholds.cpuPercent}%)`
  if (typeof sample.memoryPercent === 'number' && sample.memoryPercent >= thresholds.memoryPercent) return `memory reached ${sample.memoryPercent}% (stop threshold ${thresholds.memoryPercent}%)`
  return null
}

async function runTest (config, dependencies = {}) {
  const createSessionFn = dependencies.createSession || createSession
  const preflightFn = dependencies.preflight || preflight
  const sleepFn = dependencies.sleep || sleep
  const nowMs = dependencies.nowMs || Date.now
  const signal = dependencies.signal
  const metricsProvider = dependencies.metricsProvider || (config.observability.enabled ? () => readMetricsFile(config.observability.metricsFile) : null)
  const errors = []
  const startedAt = new Date().toISOString()
  const result = {
    schemaVersion: 1,
    runId: runId(),
    status: 'FAIL',
    summary: '',
    startedAt,
    completedAt: null,
    target: config.target,
    library: { name: 'bedboo', version: '0.0.0', commit: BEDBOO_COMMIT },
    authMode: config.auth.mode,
    scenario: config.scenario,
    preflight: null,
    metrics: { spawnedClients: 0, maximumSimultaneous: 0, simultaneousHoldSeconds: 0 },
    clients: [],
    errors,
    aborted: false,
    portVerification: {
      tcpSharedPortProbed: true,
      udpSharedPortObserved: false,
      additionalPortsInspected: false
    },
    laboratoryMetrics: {
      enabled: config.observability.enabled,
      source: config.observability.enabled ? config.observability.metricsFile : 'not configured',
      thresholds: config.observability.thresholds,
      samples: [],
      stopReason: null
    },
    limitations: [
      'La herramienta no tiene acceso al nodo/Wings/firewall y no puede demostrar por sí sola qué puertos UDP recibió el nodo.',
      'El éxito de ingreso simultáneo no demuestra ausencia de puertos auxiliares sin una captura o inspección del nodo.',
      'La latencia sólo se informa cuando el backend WebRTC expone currentRoundTripTime.',
      'No se modifica server.properties, online-mode, el mundo, el Egg, Wings, Docker ni el firewall.'
    ]
  }

  try {
    result.preflight = await preflightFn(config)
    if (!result.preflight.tcpSignalingReachable) throw new Error(`NetherNet signaling preflight returned HTTP ${result.preflight.status}`)
  } catch (error) {
    errors.push({ at: new Date().toISOString(), clientId: null, category: 'signaling', message: error.message })
    result.summary = 'FAIL: la señalización TCP no superó la comprobación previa; no se iniciaron bots.'
    result.completedAt = new Date().toISOString()
    return result
  }

  const createBot = dependencies.createBot || (createSessionFn === createSession ? require('bedboo').createBot : null)
  const sessions = config.auth.clients.map(definition => createSessionFn(definition, config, createBot, item => errors.push(item)))
  result.clients = sessions.map(session => session.record)
  let maximum = 0
  const concurrencyTimer = setInterval(() => {
    maximum = Math.max(maximum, sessions.filter(session => session.isActive()).length)
  }, 100)
  let resolveHealth
  const healthStopped = new Promise(resolve => { resolveHealth = resolve })
  const sampleHealth = () => {
    if (!metricsProvider || result.laboratoryMetrics.stopReason) return
    try {
      const provided = metricsProvider()
      if (!provided || typeof provided !== 'object' || Array.isArray(provided)) throw new Error('metrics source must contain a JSON object')
      const sample = { observedAt: new Date().toISOString(), ...provided }
      result.laboratoryMetrics.samples.push(sample)
      const failure = healthFailure(sample, config.observability.thresholds)
      if (failure) {
        result.laboratoryMetrics.stopReason = failure
        resolveHealth()
      }
    } catch (error) {
      result.laboratoryMetrics.stopReason = `metrics unavailable: ${error.message}`
      resolveHealth()
    }
  }
  sampleHealth()
  const healthTimer = metricsProvider ? setInterval(sampleHealth, config.observability.sampleIntervalSeconds * 1000) : null

  try {
    for (let index = 0; index < sessions.length; index++) {
      if (result.laboratoryMetrics.stopReason) throw new Error(`safety stop: ${result.laboratoryMetrics.stopReason}`)
      sessions[index].start()
      if (index < sessions.length - 1) await sleepFn(config.intervalSeconds * 1000, signal)
    }
    await Promise.race([Promise.all(sessions.map(session => session.ready)), healthStopped, abortPromise(signal)])
    if (result.laboratoryMetrics.stopReason) throw new Error(`safety stop: ${result.laboratoryMetrics.stopReason}`)
    maximum = Math.max(maximum, sessions.filter(session => session.isActive()).length)
    if (sessions.filter(session => session.isActive()).length !== config.scenario.clients) {
      throw new Error('not all required clients reached world spawn; simultaneous hold was not started')
    }

    const holdStarted = nowMs()
    const holdEnds = holdStarted + config.scenario.durationSeconds * 1000
    const hold = createContinuousHoldTracker(config.scenario.clients, holdStarted)
    hold.sample(sessions.filter(session => session.isActive()).length, holdStarted)
    while (nowMs() < holdEnds) {
      if (result.laboratoryMetrics.stopReason) throw new Error(`safety stop: ${result.laboratoryMetrics.stopReason}`)
      hold.sample(sessions.filter(session => session.isActive()).length, nowMs())
      result.metrics.simultaneousHoldSeconds = hold.seconds()
      await sleepFn(Math.min(1000, holdEnds - nowMs()), signal)
    }
    hold.sample(sessions.filter(session => session.isActive()).length, holdEnds)
    result.metrics.simultaneousHoldSeconds = hold.seconds()
  } catch (error) {
    result.aborted = signal?.aborted || false
    errors.push({ at: new Date().toISOString(), clientId: null, category: result.aborted ? 'aborted' : 'other', message: error.message })
  } finally {
    clearInterval(concurrencyTimer)
    if (healthTimer) clearInterval(healthTimer)
    maximum = Math.max(maximum, sessions.filter(session => session.isActive()).length)
    await Promise.allSettled(sessions.map(session => session.stop()))
  }

  result.metrics.spawnedClients = result.clients.filter(client => client.spawnedAt).length
  result.metrics.maximumSimultaneous = maximum
  for (const client of result.clients) client.simultaneousHoldSeconds = result.metrics.simultaneousHoldSeconds
  const full = result.metrics.spawnedClients === config.scenario.clients && maximum === config.scenario.clients && result.metrics.simultaneousHoldSeconds >= config.scenario.durationSeconds && !result.aborted && !result.laboratoryMetrics.stopReason
  if (full) {
    result.status = 'PASS'
    result.summary = `PASS: ${config.scenario.clients} clientes ingresaron al mundo y permanecieron conectados simultáneamente durante ${config.scenario.durationSeconds} segundos.`
  } else if (result.metrics.spawnedClients > 0) {
    result.status = 'PARTIAL'
    result.summary = `PARTIAL: ${result.metrics.spawnedClients}/${config.scenario.clients} clientes ingresaron; máximo simultáneo ${maximum}.`
  } else {
    result.status = 'FAIL'
    result.summary = 'FAIL: ningún cliente completó el ingreso al mundo.'
  }
  result.completedAt = new Date().toISOString()
  return result
}

module.exports = { BEDBOO_COMMIT, abortPromise, createContinuousHoldTracker, healthFailure, readMetricsFile, runId, runTest, sleep }

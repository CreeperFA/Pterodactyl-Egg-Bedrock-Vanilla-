'use strict'

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

function runId (date = new Date()) {
  return date.toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z')
}

async function runTest (config, dependencies = {}) {
  const createBot = dependencies.createBot || require('bedboo').createBot
  const preflightFn = dependencies.preflight || preflight
  const sleepFn = dependencies.sleep || sleep
  const nowMs = dependencies.nowMs || Date.now
  const signal = dependencies.signal
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

  const sessions = config.auth.clients.map(definition => createSession(definition, config, createBot, item => errors.push(item)))
  result.clients = sessions.map(session => session.record)
  let maximum = 0
  const concurrencyTimer = setInterval(() => {
    maximum = Math.max(maximum, sessions.filter(session => session.isActive()).length)
  }, 100)

  try {
    for (let index = 0; index < sessions.length; index++) {
      sessions[index].start()
      if (index < sessions.length - 1) await sleepFn(config.intervalSeconds * 1000, signal)
    }
    await Promise.all(sessions.map(session => session.ready))
    maximum = Math.max(maximum, sessions.filter(session => session.isActive()).length)

    const holdStarted = nowMs()
    const holdEnds = holdStarted + config.scenario.durationSeconds * 1000
    let heldTogetherUntil = holdStarted
    while (nowMs() < holdEnds) {
      if (sessions.every(session => session.isActive())) heldTogetherUntil = nowMs()
      await sleepFn(Math.min(1000, holdEnds - nowMs()), signal)
    }
    if (sessions.every(session => session.isActive())) heldTogetherUntil = holdEnds
    result.metrics.simultaneousHoldSeconds = Math.max(0, Math.floor((heldTogetherUntil - holdStarted) / 1000))
  } catch (error) {
    result.aborted = signal?.aborted || false
    errors.push({ at: new Date().toISOString(), clientId: null, category: result.aborted ? 'aborted' : 'other', message: error.message })
  } finally {
    clearInterval(concurrencyTimer)
    maximum = Math.max(maximum, sessions.filter(session => session.isActive()).length)
    await Promise.allSettled(sessions.map(session => session.stop()))
  }

  result.metrics.spawnedClients = result.clients.filter(client => client.spawnedAt).length
  result.metrics.maximumSimultaneous = maximum
  const full = result.metrics.spawnedClients === config.scenario.clients && maximum === config.scenario.clients && result.metrics.simultaneousHoldSeconds >= config.scenario.durationSeconds - 1 && !result.aborted
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

module.exports = { BEDBOO_COMMIT, runId, runTest, sleep }

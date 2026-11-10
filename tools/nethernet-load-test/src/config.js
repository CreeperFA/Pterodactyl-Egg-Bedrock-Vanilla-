'use strict'

const fs = require('fs')
const path = require('path')

const SCENARIOS = Object.freeze({
  basic: Object.freeze({ clients: 1, durationSeconds: 180 }),
  medium: Object.freeze({ clients: 10, durationSeconds: 180 }),
  high: Object.freeze({ clients: 30, durationSeconds: 180 }),
  maximum: Object.freeze({ clients: 50, durationSeconds: 180 })
})
const SCENARIO_ORDER = Object.freeze(['basic', 'medium', 'high', 'maximum'])
const MAX_CLIENTS = 50
const AUTHORIZED_TARGET = '102.129.137.35:9000'

function fail (message) {
  const error = new Error(message)
  error.code = 'ERR_INVALID_CONFIG'
  throw error
}

function isPlainObject (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function targetName (target) {
  const host = target.host.includes(':') ? `[${target.host}]` : target.host
  return `${host}:${target.port}`
}

function generateOfflineClients (count = MAX_CLIENTS) {
  return Array.from({ length: count }, (_, index) => ({
    id: `bot-${String(index + 1).padStart(2, '0')}`,
    username: `SCBot${String(index + 1).padStart(2, '0')}`
  }))
}

function validateConfig (input, options = {}) {
  if (!isPlainObject(input)) fail('configuration must be a JSON object')
  const target = input.target
  if (!isPlainObject(target)) fail('target is required')
  if (typeof target.host !== 'string' || !target.host.trim()) fail('target.host is required')
  if (!Number.isInteger(target.port) || target.port < 1 || target.port > 65535) fail('target.port must be an integer from 1 to 65535')
  if (target.transport !== 'nethernet') fail("target.transport must be 'nethernet'; RakNet is not accepted by this test")
  if (target.bdsVersion !== '1.26.63.1') fail("target.bdsVersion must be '1.26.63.1' for this laboratory phase")
  if (targetName(target) !== AUTHORIZED_TARGET) fail(`this laboratory build is restricted to the authorized target ${AUTHORIZED_TARGET}`)

  const authorization = input.authorization
  if (!isPlainObject(authorization)) fail('authorization is required')
  if (authorization.confirmed !== true && !options.checkOnly) fail('authorization.confirmed must be true before a real network test')
  if (authorization.target !== targetName(target)) fail(`authorization.target must exactly match ${targetName(target)}`)

  const scenarioName = options.scenario || input.scenario
  const scenario = SCENARIOS[scenarioName]
  if (!scenario) fail(`scenario must be one of: ${Object.keys(SCENARIOS).join(', ')}`)
  if (scenario.clients > MAX_CLIENTS) fail(`the hard safety limit is ${MAX_CLIENTS} clients`)

  const intervalSeconds = input.intervalSeconds ?? 4
  if (typeof intervalSeconds !== 'number' || intervalSeconds < 3 || intervalSeconds > 5) fail('intervalSeconds must be between 3 and 5')
  const connectTimeoutSeconds = input.connectTimeoutSeconds ?? 45
  if (typeof connectTimeoutSeconds !== 'number' || connectTimeoutSeconds < 10 || connectTimeoutSeconds > 120) fail('connectTimeoutSeconds must be between 10 and 120')
  const shutdownTimeoutSeconds = input.shutdownTimeoutSeconds ?? 10
  if (typeof shutdownTimeoutSeconds !== 'number' || shutdownTimeoutSeconds < 1 || shutdownTimeoutSeconds > 30) fail('shutdownTimeoutSeconds must be between 1 and 30')
  const recoverySeconds = input.recoverySeconds ?? 30
  if (!Number.isInteger(recoverySeconds) || recoverySeconds < 5 || recoverySeconds > 600) fail('recoverySeconds must be an integer between 5 and 600')

  const auth = input.auth
  if (!isPlainObject(auth) || !['microsoft', 'offline'].includes(auth.mode)) fail("auth.mode must be 'microsoft' or 'offline'")
  if (auth.mode === 'offline' && authorization.offlineApproved !== true && !options.checkOnly) {
    fail('offline tests require separate authorization.offlineApproved=true; this tool never changes online-mode')
  }
  if (auth.mode === 'offline' && authorization.networkRestrictionVerified !== true && !options.checkOnly) {
    fail('offline tests require authorization.networkRestrictionVerified=true after an administrator verifies the external TCP+UDP restriction')
  }
  if (!options.checkOnly && (!Number.isInteger(authorization.serverCapacity) || authorization.serverCapacity < scenario.clients)) {
    fail(`authorization.serverCapacity must confirm at least ${scenario.clients} players before this scenario`)
  }
  if (!options.checkOnly && ['high', 'maximum'].includes(scenarioName) && authorization.scaleApproved?.[scenarioName] !== true) {
    fail(`authorization.scaleApproved.${scenarioName}=true is required after the previous scenario passes and node capacity is reviewed`)
  }

  if (auth.generateOfflineClients === true && auth.mode !== 'offline') fail('generateOfflineClients is available only in offline mode')
  if (auth.generateOfflineClients === true && Array.isArray(auth.clients) && auth.clients.length) fail('use either generateOfflineClients or auth.clients, not both')
  const clientDefinitions = auth.generateOfflineClients === true ? generateOfflineClients() : auth.clients
  if (Array.isArray(clientDefinitions) && clientDefinitions.length > MAX_CLIENTS) fail(`auth.clients cannot exceed the hard safety limit of ${MAX_CLIENTS}`)
  if (!Array.isArray(clientDefinitions) || clientDefinitions.length < scenario.clients) {
    fail(`auth.clients must contain at least ${scenario.clients} independent client definitions`)
  }

  const clients = clientDefinitions.slice(0, scenario.clients).map((client, index) => {
    if (!isPlainObject(client)) fail(`auth.clients[${index}] must be an object`)
    const id = client.id
    const username = client.username
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,32}$/.test(id)) fail(`auth.clients[${index}].id is invalid`)
    if (typeof username !== 'string' || !username.trim()) fail(`auth.clients[${index}].username is required`)
    if (auth.mode === 'microsoft' && (!path.isAbsolute(client.profilesFolder || ''))) {
      fail(`auth.clients[${index}].profilesFolder must be an absolute external token-cache path`)
    }
    return { id, username, profilesFolder: client.profilesFolder }
  })

  if (new Set(clients.map(client => client.id)).size !== clients.length) fail('every client id must be unique')
  if (new Set(clients.map(client => client.username)).size !== clients.length) fail('every client username/cache identity must be unique')
  if (auth.mode === 'microsoft' && new Set(clients.map(client => path.resolve(client.profilesFolder))).size !== clients.length) {
    fail('every Microsoft client must use a distinct profilesFolder and identity')
  }

  const observability = input.observability || {}
  if (!isPlainObject(observability)) fail('observability must be an object')
  if (observability.thresholds !== undefined && !isPlainObject(observability.thresholds)) fail('observability.thresholds must be an object')
  if (observability.enabled !== undefined && typeof observability.enabled !== 'boolean') fail('observability.enabled must be boolean')
  const sampleIntervalSeconds = observability.sampleIntervalSeconds ?? 5
  if (!Number.isInteger(sampleIntervalSeconds) || sampleIntervalSeconds < 1 || sampleIntervalSeconds > 30) fail('observability.sampleIntervalSeconds must be an integer between 1 and 30')
  const cpuPercent = observability.thresholds?.cpuPercent ?? 90
  const memoryPercent = observability.thresholds?.memoryPercent ?? 90
  if (typeof cpuPercent !== 'number' || cpuPercent < 50 || cpuPercent > 100) fail('observability.thresholds.cpuPercent must be between 50 and 100')
  if (typeof memoryPercent !== 'number' || memoryPercent < 50 || memoryPercent > 100) fail('observability.thresholds.memoryPercent must be between 50 and 100')
  const metricsFile = observability.metricsFile || ''
  if (observability.enabled === true && !path.isAbsolute(metricsFile)) fail('observability.metricsFile must be an absolute path when observability is enabled')

  return Object.freeze({
    target: Object.freeze({ ...target, host: target.host.trim() }),
    authorization: Object.freeze({ ...authorization }),
    auth: Object.freeze({ mode: auth.mode, clients: Object.freeze(clients) }),
    scenario: Object.freeze({ name: scenarioName, ...scenario }),
    intervalSeconds,
    connectTimeoutSeconds,
    shutdownTimeoutSeconds,
    recoverySeconds,
    observability: Object.freeze({
      enabled: observability.enabled === true,
      metricsFile,
      sampleIntervalSeconds,
      thresholds: Object.freeze({
        cpuPercent,
        memoryPercent
      })
    }),
    reportDirectory: input.reportDirectory || 'reports'
  })
}

function loadConfig (file, options = {}) {
  const absolute = path.resolve(file)
  let input
  try {
    input = JSON.parse(fs.readFileSync(absolute, 'utf8'))
  } catch (error) {
    fail(`cannot read configuration ${absolute}: ${error.message}`)
  }
  return { file: absolute, config: validateConfig(input, options) }
}

module.exports = { AUTHORIZED_TARGET, MAX_CLIENTS, SCENARIOS, SCENARIO_ORDER, generateOfflineClients, loadConfig, targetName, validateConfig }

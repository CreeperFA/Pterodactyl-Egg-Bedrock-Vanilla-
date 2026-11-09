'use strict'

const { classifyError, errorText, getRtcConnection, readRoundTripTimeMs, snapshotRtc } = require('./diagnostics')

function now () { return new Date().toISOString() }

function createSession (definition, config, createBot, recordRunError) {
  const record = {
    id: definition.id,
    username: definition.username,
    authMode: config.auth.mode,
    phase: 'pending',
    startedAt: null,
    connectedAt: null,
    loginAt: null,
    spawnedAt: null,
    endedAt: null,
    timeToSpawnMs: null,
    sessionDurationMs: null,
    authentication: { result: 'pending', deviceCodeRequested: false },
    ice: snapshotRtc(null),
    iceHistory: [],
    latencySamplesMs: [],
    disconnectReason: null,
    errors: []
  }
  let bot = null
  let terminal = false
  let monitor = null
  let readyResolve
  const ready = new Promise(resolve => { readyResolve = resolve })

  function addError (error) {
    const item = { at: now(), category: classifyError(error), message: errorText(error) }
    record.errors.push(item)
    recordRunError({ ...item, clientId: record.id })
  }

  function end (reason) {
    if (terminal) return
    terminal = true
    record.endedAt = now()
    record.disconnectReason = reason ? errorText(reason) : record.disconnectReason
    if (record.startedAt) record.sessionDurationMs = Date.parse(record.endedAt) - Date.parse(record.startedAt)
    if (!record.spawnedAt && record.authentication.result === 'pending') record.authentication.result = 'failed'
    if (record.phase !== 'spawned') readyResolve(record)
    record.phase = record.spawnedAt ? 'ended' : 'failed'
    if (monitor) clearInterval(monitor)
  }

  function monitorRtc () {
    const next = snapshotRtc(bot)
    const previous = record.ice
    record.ice = next
    if (next.connectionState !== previous.connectionState || next.iceConnectionState !== previous.iceConnectionState || next.iceGatheringState !== previous.iceGatheringState) {
      record.iceHistory.push({ at: now(), ...next })
    }
    const rtc = getRtcConnection(bot)
    readRoundTripTimeMs(rtc).then(value => {
      if (value !== null) record.latencySamplesMs.push(value)
    }).catch(() => {})
  }

  function start () {
    record.startedAt = now()
    record.phase = 'connecting'
    const options = {
      host: config.target.host,
      port: config.target.port,
      version: config.target.bdsVersion,
      transport: 'nethernet',
      auth: config.auth.mode,
      username: definition.username,
      physicsEnabled: true,
      conLog: null,
      nethernet: {
        signalling: 'http',
        signallingConnectTimeout: config.connectTimeoutSeconds * 1000,
        ...(config.target.serverKey ? { serverKey: config.target.serverKey } : {})
      },
      ...(definition.profilesFolder ? { profilesFolder: definition.profilesFolder } : {}),
      onMsaCode: code => {
        record.authentication.deviceCodeRequested = true
        console.log(`[${record.id}] Microsoft device authorization required:`, code)
      }
    }
    try {
      bot = createBot(options)
    } catch (error) {
      addError(error)
      end(error)
      return ready
    }

    bot.once('connect', () => {
      record.connectedAt = now()
      record.phase = 'connected'
    })
    bot.once('login', () => {
      record.loginAt = now()
      record.phase = 'login'
      record.authentication.result = 'accepted'
    })
    bot.once('spawn', () => {
      if (record.spawnedAt) return
      record.spawnedAt = now()
      record.timeToSpawnMs = Date.parse(record.spawnedAt) - Date.parse(record.startedAt)
      record.phase = 'spawned'
      record.authentication.result = 'accepted'
      monitorRtc()
      readyResolve(record)
    })
    bot.on('kicked', reason => {
      addError(`kicked: ${errorText(reason)}`)
      end(reason)
    })
    bot.on('error', error => addError(error))
    bot.once('end', reason => end(reason))
    monitor = setInterval(monitorRtc, 1000)

    setTimeout(() => {
      if (!record.spawnedAt && !terminal) {
        const error = new Error(`world-entry timeout after ${config.connectTimeoutSeconds}s`)
        addError(error)
        end(error)
        try { bot.quit('test timeout') } catch {}
      }
    }, config.connectTimeoutSeconds * 1000).unref()
    return ready
  }

  async function stop () {
    if (monitor) clearInterval(monitor)
    if (!bot || terminal) return
    await new Promise(resolve => {
      let finished = false
      const finish = () => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(finish, config.shutdownTimeoutSeconds * 1000)
      bot.once('end', finish)
      try { bot.quit('SuperCores laboratory test complete') } catch (error) { addError(error); finish() }
    })
    end('client shutdown')
  }

  return { record, ready, start, stop, isActive: () => record.phase === 'spawned' && !terminal }
}

module.exports = { createSession }

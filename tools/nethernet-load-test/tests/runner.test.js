'use strict'

const assert = require('assert')
const path = require('path')
const { EventEmitter } = require('events')
const { it } = require('node:test')
const { validateConfig } = require('../src/config')
const { createContinuousHoldTracker, healthFailure, runTest } = require('../src/runner')

it('never resumes continuous hold accounting after an intermediate disconnect', () => {
  const hold = createContinuousHoldTracker(5, 0)
  hold.sample(5, 1000)
  hold.sample(4, 2000)
  hold.sample(5, 180000)
  assert.strictEqual(hold.seconds(), 1)
  assert.strictEqual(hold.isContinuous(), false)
})

it('counts a client only after world spawn and can produce PASS', async () => {
  const input = {
    target: { host: '102.129.137.35', port: 9000, bdsVersion: '1.26.63.1', transport: 'nethernet' },
    authorization: { confirmed: true, target: '102.129.137.35:9000', serverCapacity: 50 },
    auth: { mode: 'microsoft', clients: [{ id: 'bot-1', username: 'account-1', profilesFolder: path.resolve('/external/account-1') }] },
    scenario: 'basic',
    intervalSeconds: 4,
    connectTimeoutSeconds: 10
  }
  const config = validateConfig(input)
  let virtualNow = 0
  const createBot = () => {
    const bot = new EventEmitter()
    bot.quit = () => bot.emit('end', 'done')
    queueMicrotask(() => {
      bot.emit('connect')
      bot.emit('login')
      bot.emit('spawn')
    })
    return bot
  }
  const result = await runTest(config, {
    createBot,
    preflight: async () => ({ tcpSignalingReachable: true, status: 200 }),
    nowMs: () => virtualNow,
    sleep: async milliseconds => { virtualNow += milliseconds; await Promise.resolve() }
  })
  assert.strictEqual(result.status, 'PASS')
  assert.strictEqual(result.metrics.spawnedClients, 1)
  assert.strictEqual(result.metrics.maximumSimultaneous, 1)
  assert.strictEqual(result.clients[0].authentication.result, 'accepted')
  assert.ok(result.clients[0].spawnedAt)
})

it('never treats an incomplete or timed-out world entry as a successful connection', async () => {
  const input = {
    target: { host: '102.129.137.35', port: 9000, bdsVersion: '1.26.63.1', transport: 'nethernet' },
    authorization: { confirmed: true, target: '102.129.137.35:9000', serverCapacity: 50 },
    auth: { mode: 'microsoft', clients: [{ id: 'bot-1', username: 'account-1', profilesFolder: path.resolve('/external/account-1') }] },
    scenario: 'basic'
  }
  const config = validateConfig(input)
  let stopped = false
  const record = { id: 'bot-1', username: 'account-1', spawnedAt: null, errors: [{ message: 'world-entry timeout' }], latencySamplesMs: [] }
  const result = await runTest(config, {
    createSession: () => ({ record, ready: Promise.resolve(record), start: () => {}, stop: async () => { stopped = true }, isActive: () => false }),
    preflight: async () => ({ tcpSignalingReachable: true, status: 200 }),
    nowMs: (() => { const now = 0; return () => now })(),
    sleep: async () => {}
  })
  assert.strictEqual(result.status, 'FAIL')
  assert.strictEqual(result.metrics.spawnedClients, 0)
  assert.strictEqual(stopped, true)
})

it('reports signaling connectivity loss without starting sessions', async () => {
  const input = {
    target: { host: '102.129.137.35', port: 9000, bdsVersion: '1.26.63.1', transport: 'nethernet' },
    authorization: { confirmed: true, target: '102.129.137.35:9000', serverCapacity: 50 },
    auth: { mode: 'microsoft', clients: [{ id: 'bot-1', username: 'account-1', profilesFolder: path.resolve('/external/account-1') }] },
    scenario: 'basic'
  }
  const result = await runTest(validateConfig(input), { preflight: async () => { throw new Error('network unreachable') } })
  assert.strictEqual(result.status, 'FAIL')
  assert.match(result.summary, /señalización TCP/)
  assert.strictEqual(result.clients.length, 0)
})

it('cancels safely and closes every started session', async () => {
  const input = {
    target: { host: '102.129.137.35', port: 9000, bdsVersion: '1.26.63.1', transport: 'nethernet' },
    authorization: { confirmed: true, target: '102.129.137.35:9000', serverCapacity: 50 },
    auth: { mode: 'microsoft', clients: [{ id: 'bot-1', username: 'account-1', profilesFolder: path.resolve('/external/account-1') }] },
    scenario: 'basic'
  }
  const controller = new AbortController()
  let stopped = false
  const record = { id: 'bot-1', username: 'account-1', spawnedAt: new Date().toISOString(), errors: [], latencySamplesMs: [] }
  controller.abort(new Error('operator requested stop'))
  const result = await runTest(validateConfig(input), {
    signal: controller.signal,
    createSession: () => ({ record, ready: Promise.resolve(record), start: () => {}, stop: async () => { stopped = true }, isActive: () => true }),
    preflight: async () => ({ tcpSignalingReachable: true, status: 200 }),
    sleep: async () => { throw controller.signal.reason }
  })
  assert.strictEqual(result.aborted, true)
  assert.notStrictEqual(result.status, 'PASS')
  assert.strictEqual(stopped, true)
})

it('defines conservative resource stop conditions without inventing unavailable metrics', () => {
  assert.match(healthFailure({ cpuPercent: 95 }, { cpuPercent: 90, memoryPercent: 90 }), /CPU/)
  assert.match(healthFailure({ memoryPercent: 92 }, { cpuPercent: 90, memoryPercent: 90 }), /memory/)
  assert.match(healthFailure({ processRunning: false }, { cpuPercent: 90, memoryPercent: 90 }), /unavailable/)
  assert.strictEqual(healthFailure({ players: 10 }, { cpuPercent: 90, memoryPercent: 90 }), null)
})

it('stops before starting bots when authorized metrics already exceed a threshold', async () => {
  const input = {
    target: { host: '102.129.137.35', port: 9000, bdsVersion: '1.26.63.1', transport: 'nethernet' },
    authorization: { confirmed: true, target: '102.129.137.35:9000', serverCapacity: 50 },
    auth: { mode: 'microsoft', clients: [{ id: 'bot-1', username: 'account-1', profilesFolder: path.resolve('/external/account-1') }] },
    scenario: 'basic',
    observability: { enabled: true, metricsFile: path.resolve('/metrics/lab.json'), thresholds: { cpuPercent: 90, memoryPercent: 90 } }
  }
  let starts = 0
  let stops = 0
  const record = { id: 'bot-1', username: 'account-1', spawnedAt: null, errors: [], latencySamplesMs: [] }
  const result = await runTest(validateConfig(input), {
    metricsProvider: () => ({ cpuPercent: 95, processRunning: true }),
    createSession: () => ({ record, ready: Promise.resolve(record), start: () => { starts++ }, stop: async () => { stops++ }, isActive: () => false }),
    preflight: async () => ({ tcpSignalingReachable: true, status: 200 })
  })
  assert.strictEqual(starts, 0)
  assert.strictEqual(stops, 1)
  assert.notStrictEqual(result.status, 'PASS')
  assert.match(result.laboratoryMetrics.stopReason, /CPU/)
})

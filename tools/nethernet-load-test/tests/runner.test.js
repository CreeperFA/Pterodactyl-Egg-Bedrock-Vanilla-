'use strict'

const assert = require('assert')
const path = require('path')
const { EventEmitter } = require('events')
const { it } = require('node:test')
const { validateConfig } = require('../src/config')
const { createContinuousHoldTracker, runTest } = require('../src/runner')

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
    authorization: { confirmed: true, target: '102.129.137.35:9000' },
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

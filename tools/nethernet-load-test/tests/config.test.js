'use strict'

const assert = require('assert')
const path = require('path')
const { describe, it } = require('node:test')
const { SCENARIOS, validateConfig } = require('../src/config')

function baseConfig () {
  return {
    target: { host: '102.129.137.35', port: 9000, bdsVersion: '1.26.63.1', transport: 'nethernet' },
    authorization: { confirmed: true, target: '102.129.137.35:9000', offlineApproved: false },
    auth: { mode: 'microsoft', clients: Array.from({ length: 10 }, (_, index) => ({ id: `bot-${index}`, username: `account-${index}`, profilesFolder: path.resolve(`/external/auth-${index}`) })) },
    scenario: 'basic',
    intervalSeconds: 4
  }
}

describe('configuration safety', () => {
  it('defines the required progressive scenarios and never exceeds 10 clients', () => {
    assert.deepStrictEqual(SCENARIOS.basic, { clients: 1, durationSeconds: 60 })
    assert.deepStrictEqual(SCENARIOS.multiplex, { clients: 2, durationSeconds: 120 })
    assert.deepStrictEqual(SCENARIOS.medium, { clients: 5, durationSeconds: 180 })
    assert.deepStrictEqual(SCENARIOS.expanded, { clients: 10, durationSeconds: 300 })
    assert.ok(Object.values(SCENARIOS).every(item => item.clients <= 10))
  })

  it('accepts the authorized NetherNet laboratory target', () => {
    const config = validateConfig(baseConfig())
    assert.strictEqual(config.target.transport, 'nethernet')
    assert.strictEqual(config.scenario.clients, 1)
  })

  it('rejects target mismatches and RakNet substitutions', () => {
    const mismatch = baseConfig()
    mismatch.target.port = 9001
    assert.throws(() => validateConfig(mismatch), /restricted to the authorized target/)
    const raknet = baseConfig()
    raknet.target.transport = 'raknet'
    assert.throws(() => validateConfig(raknet), /RakNet is not accepted/)
  })

  it('requires explicit offline authorization and distinct Microsoft caches', () => {
    const offline = baseConfig()
    offline.auth.mode = 'offline'
    assert.throws(() => validateConfig(offline), /offline tests require separate authorization/)
    const duplicate = baseConfig()
    duplicate.scenario = 'multiplex'
    duplicate.auth.clients[1].profilesFolder = duplicate.auth.clients[0].profilesFolder
    assert.throws(() => validateConfig(duplicate), /distinct profilesFolder/)
  })

  it('permits check-only validation without authorizing a network run', () => {
    const input = baseConfig()
    input.authorization.confirmed = false
    const config = validateConfig(input, { checkOnly: true })
    assert.strictEqual(config.authorization.confirmed, false)
  })
})

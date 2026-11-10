'use strict'

const assert = require('assert')
const path = require('path')
const { describe, it } = require('node:test')
const { MAX_CLIENTS, SCENARIOS, generateOfflineClients, validateConfig } = require('../src/config')

function baseConfig () {
  return {
    target: { host: '102.129.137.35', port: 9000, bdsVersion: '1.26.63.1', transport: 'nethernet' },
    authorization: { confirmed: true, target: '102.129.137.35:9000', offlineApproved: false, serverCapacity: 50, scaleApproved: { high: true, maximum: true } },
    auth: { mode: 'microsoft', clients: Array.from({ length: 50 }, (_, index) => ({ id: `bot-${index}`, username: `account-${index}`, profilesFolder: path.resolve(`/external/auth-${index}`) })) },
    scenario: 'basic',
    intervalSeconds: 4
  }
}

describe('configuration safety', () => {
  it('defines the required progressive scenarios and never exceeds 50 clients', () => {
    assert.deepStrictEqual(SCENARIOS.basic, { clients: 1, durationSeconds: 180 })
    assert.deepStrictEqual(SCENARIOS.medium, { clients: 10, durationSeconds: 180 })
    assert.deepStrictEqual(SCENARIOS.high, { clients: 30, durationSeconds: 180 })
    assert.deepStrictEqual(SCENARIOS.maximum, { clients: 50, durationSeconds: 180 })
    assert.strictEqual(MAX_CLIENTS, 50)
    assert.ok(Object.values(SCENARIOS).every(item => item.clients <= MAX_CLIENTS))
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
    duplicate.scenario = 'medium'
    duplicate.auth.clients[1].profilesFolder = duplicate.auth.clients[0].profilesFolder
    assert.throws(() => validateConfig(duplicate), /distinct profilesFolder/)
  })

  it('permits check-only validation without authorizing a network run', () => {
    const input = baseConfig()
    input.authorization.confirmed = false
    const config = validateConfig(input, { checkOnly: true })
    assert.strictEqual(config.authorization.confirmed, false)
  })

  it('generates exactly 50 distinct offline identities and enforces both offline approvals', () => {
    const identities = generateOfflineClients()
    assert.strictEqual(identities.length, 50)
    assert.strictEqual(identities[0].username, 'SCBot01')
    assert.strictEqual(identities[49].username, 'SCBot50')
    assert.strictEqual(new Set(identities.map(item => item.username)).size, 50)

    const offline = baseConfig()
    offline.auth = { mode: 'offline', generateOfflineClients: true }
    offline.authorization.offlineApproved = true
    offline.authorization.networkRestrictionVerified = false
    assert.throws(() => validateConfig(offline), /networkRestrictionVerified/)
    offline.authorization.networkRestrictionVerified = true
    assert.strictEqual(validateConfig(offline, { scenario: 'maximum' }).auth.clients.length, 50)
  })

  it('rejects more than 50 definitions and missing scale or server-capacity approval', () => {
    const tooMany = baseConfig()
    tooMany.auth.clients.push({ id: 'bot-51', username: 'account-51', profilesFolder: path.resolve('/external/auth-51') })
    assert.throws(() => validateConfig(tooMany), /cannot exceed.*50/)

    const high = baseConfig()
    high.authorization.scaleApproved.high = false
    assert.throws(() => validateConfig(high, { scenario: 'high' }), /scaleApproved.high/)
    high.authorization.scaleApproved.high = true
    high.authorization.serverCapacity = 10
    assert.throws(() => validateConfig(high, { scenario: 'high' }), /serverCapacity.*30/)
  })
})

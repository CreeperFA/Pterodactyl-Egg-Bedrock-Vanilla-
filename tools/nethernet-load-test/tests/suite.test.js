'use strict'

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { it } = require('node:test')
const { runSuite } = require('../src/cli')

it('validates all four scenarios without opening network connections and writes a consolidated report', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'supercores-suite-'))
  try {
    const configFile = path.join(directory, 'config.json')
    fs.writeFileSync(configFile, JSON.stringify({
      target: { host: '102.129.137.35', port: 9000, bdsVersion: '1.26.63.1', transport: 'nethernet' },
      authorization: { confirmed: false, target: '102.129.137.35:9000', offlineApproved: false, networkRestrictionVerified: false, serverCapacity: 10, scaleApproved: { high: false, maximum: false } },
      auth: { mode: 'offline', generateOfflineClients: true },
      scenario: 'basic',
      reportDirectory: 'reports'
    }))
    const output = await runSuite(configFile, { checkOnly: true })
    assert.strictEqual(output.suite.status, 'NOT TESTED')
    assert.deepStrictEqual(output.suite.scenarios.map(item => item.clients), [1, 10, 30, 50])
    assert.ok(output.suite.scenarios.every(item => item.status === 'NOT TESTED'))
    assert.ok(fs.existsSync(path.join(output.directory, 'REPORT.md')))
    for (const item of output.suite.scenarios) assert.ok(fs.existsSync(path.join(item.reportDirectory, 'results.json')))
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

it('does not start a later scenario after the previous stage fails', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'supercores-suite-stop-'))
  try {
    const configFile = path.join(directory, 'config.json')
    fs.writeFileSync(configFile, JSON.stringify({
      target: { host: '102.129.137.35', port: 9000, bdsVersion: '1.26.63.1', transport: 'nethernet' },
      authorization: { confirmed: true, target: '102.129.137.35:9000', offlineApproved: true, networkRestrictionVerified: true, serverCapacity: 50, scaleApproved: { high: true, maximum: true } },
      auth: { mode: 'offline', generateOfflineClients: true },
      scenario: 'basic',
      recoverySeconds: 5,
      reportDirectory: 'reports'
    }))
    let calls = 0
    const output = await runSuite(configFile, {
      checkOnly: false,
      runTest: async config => {
        calls++
        return {
          runId: 'fake',
          status: 'FAIL',
          scenario: config.scenario,
          metrics: { spawnedClients: 0, maximumSimultaneous: 0, simultaneousHoldSeconds: 0 },
          clients: [],
          errors: [],
          limitations: [],
          target: config.target,
          library: {},
          authMode: config.auth.mode,
          startedAt: 'a',
          completedAt: 'b',
          summary: 'fixture failure',
          preflight: null,
          portVerification: { udpSharedPortObserved: false, additionalPortsInspected: false }
        }
      },
      sleep: async () => { throw new Error('recovery pause must not run after failure') }
    })
    assert.strictEqual(calls, 1)
    assert.deepStrictEqual(output.suite.scenarios.map(item => item.status), ['FAIL', 'NOT TESTED', 'NOT TESTED', 'NOT TESTED'])
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

it('records a security block before 30 clients when scale approval is absent', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'supercores-suite-gate-'))
  try {
    const configFile = path.join(directory, 'config.json')
    fs.writeFileSync(configFile, JSON.stringify({
      target: { host: '102.129.137.35', port: 9000, bdsVersion: '1.26.63.1', transport: 'nethernet' },
      authorization: { confirmed: true, target: '102.129.137.35:9000', offlineApproved: true, networkRestrictionVerified: true, serverCapacity: 50, scaleApproved: { high: false, maximum: false } },
      auth: { mode: 'offline', generateOfflineClients: true },
      recoverySeconds: 5,
      reportDirectory: 'reports'
    }))
    let calls = 0
    const output = await runSuite(configFile, {
      checkOnly: false,
      runTest: async config => {
        calls++
        return {
          runId: 'fake',
          status: 'PASS',
          scenario: config.scenario,
          metrics: { spawnedClients: config.scenario.clients, maximumSimultaneous: config.scenario.clients, simultaneousHoldSeconds: 180 },
          clients: [],
          errors: [],
          limitations: [],
          target: config.target,
          library: {},
          authMode: config.auth.mode,
          startedAt: 'a',
          completedAt: 'b',
          summary: 'fixture pass',
          preflight: null,
          portVerification: { udpSharedPortObserved: false, additionalPortsInspected: false }
        }
      },
      sleep: async () => {}
    })
    assert.strictEqual(calls, 2)
    assert.strictEqual(output.suite.status, 'PARTIAL')
    assert.deepStrictEqual(output.suite.scenarios.map(item => item.status), ['PASS', 'PASS', 'NOT TESTED', 'NOT TESTED'])
    assert.match(output.suite.errors[0].message, /scaleApproved.high/)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

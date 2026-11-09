'use strict'

const assert = require('assert')
const { describe, it } = require('node:test')
const { clientCsv, reportMarkdown } = require('../src/reporter')

describe('reports', () => {
  const result = {
    runId: 'run',
    status: 'NOT TESTED',
    summary: 'not run',
    startedAt: 'a',
    completedAt: 'b',
    target: { host: '127.0.0.1', port: 9000, bdsVersion: '1.26.63.1', transport: 'nethernet' },
    library: { name: 'bedboo', version: '0.0.0', commit: 'abc' },
    authMode: 'microsoft',
    scenario: { name: 'basic', clients: 1, durationSeconds: 60 },
    metrics: { spawnedClients: 0, maximumSimultaneous: 0, simultaneousHoldSeconds: 0 },
    preflight: null,
    portVerification: { udpSharedPortObserved: false, additionalPortsInspected: false },
    clients: [],
    errors: [],
    limitations: ['not executed']
  }

  it('states NOT TESTED without inventing a connection result', () => {
    const report = reportMarkdown(result)
    assert.match(report, /Estado: \*\*NOT TESTED\*\*/)
    assert.match(report, /no inspeccionada directamente/)
  })

  it('writes deterministic CSV headers and escapes fields', () => {
    const csv = clientCsv([{ id: 'bot,1', errors: [], latencySamplesMs: [] }])
    assert.match(csv, /^id,username,/)
    assert.match(csv, /"bot,1"/)
  })
})

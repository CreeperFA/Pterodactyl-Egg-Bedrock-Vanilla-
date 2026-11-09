'use strict'

const assert = require('assert')
const { describe, it } = require('node:test')
const { classifyError, readRoundTripTimeMs, snapshotRtc } = require('../src/diagnostics')

describe('NetherNet diagnostics', () => {
  it('classifies signaling, ICE, UDP and authentication failures', () => {
    assert.strictEqual(classifyError(new Error('POST /v1/join fetch failed')), 'signaling')
    assert.strictEqual(classifyError(new Error('ICE candidate failed')), 'ice')
    assert.strictEqual(classifyError(new Error('UDP socket unreachable')), 'udp-network')
    assert.strictEqual(classifyError(new Error('Microsoft token rejected')), 'authentication')
  })

  it('reads selected candidate-pair latency when exposed', async () => {
    const rtc = { getStats: async () => new Map([['pair', { type: 'candidate-pair', nominated: true, currentRoundTripTime: 0.01234 }]]) }
    assert.strictEqual(await readRoundTripTimeMs(rtc), 12.34)
  })

  it('reports unavailable ICE without claiming success', () => {
    assert.deepStrictEqual(snapshotRtc(null), {
      available: false,
      connectionState: 'unavailable',
      iceConnectionState: 'unavailable',
      iceGatheringState: 'unavailable'
    })
  })
})

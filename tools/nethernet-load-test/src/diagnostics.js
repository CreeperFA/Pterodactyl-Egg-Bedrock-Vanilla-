'use strict'

function errorText (error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  if (typeof error === 'string') return error
  try { return JSON.stringify(error) } catch { return String(error) }
}

function classifyError (error) {
  const text = errorText(error)
  const lower = text.toLowerCase()
  if (/xbox|microsoft|msa|token|authenticate|authorization|unauthorized|online-mode/.test(lower)) return 'authentication'
  if (/ice|candidate|webrtc|peer connection|dtls|sctp/.test(lower)) return 'ice'
  if (/signall|\/v1\/join|http|econnrefused|fetch failed|timed out/.test(lower)) return 'signaling'
  if (/udp|turn|stun|socket|network|enetunreach|ehostunreach/.test(lower)) return 'udp-network'
  if (/kick|disconnect|server full|allow.?list|missing_client/.test(lower)) return 'server-rejection'
  return 'other'
}

function getRtcConnection (bot) {
  return bot?._client?.connection?.nethernet?.rtcConnection || null
}

async function readRoundTripTimeMs (rtc) {
  if (!rtc || typeof rtc.getStats !== 'function') return null
  try {
    const stats = await rtc.getStats()
    const rows = typeof stats?.values === 'function' ? [...stats.values()] : Array.isArray(stats) ? stats : Object.values(stats || {})
    const pair = rows.find(row => row?.type === 'candidate-pair' && (row.nominated || row.selected || row.state === 'succeeded'))
    const seconds = pair?.currentRoundTripTime
    return Number.isFinite(seconds) ? Math.round(seconds * 1000 * 100) / 100 : null
  } catch {
    return null
  }
}

function snapshotRtc (bot) {
  const rtc = getRtcConnection(bot)
  if (!rtc) return { available: false, connectionState: 'unavailable', iceConnectionState: 'unavailable', iceGatheringState: 'unavailable' }
  return {
    available: true,
    connectionState: rtc.connectionState || 'unknown',
    iceConnectionState: rtc.iceConnectionState || 'unknown',
    iceGatheringState: rtc.iceGatheringState || 'unknown'
  }
}

module.exports = { classifyError, errorText, getRtcConnection, readRoundTripTimeMs, snapshotRtc }

'use strict'

const { targetName } = require('./config')

async function preflight (config, fetchImpl = globalThis.fetch) {
  const target = targetName(config.target)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('signaling preflight timed out')), 10000)
  const startedAt = new Date().toISOString()
  try {
    const response = await fetchImpl(`http://${target}/v1/join`, { method: 'GET', redirect: 'error', signal: controller.signal })
    const body = await response.text()
    let advertisement = null
    try { advertisement = JSON.parse(body) } catch {}
    return {
      startedAt,
      completedAt: new Date().toISOString(),
      tcpSignalingReachable: response.ok,
      status: response.status,
      advertisement
    }
  } finally {
    clearTimeout(timer)
  }
}

module.exports = { preflight }

/**
 * dsh-preset-sync — Host half.
 *
 * Why this exists: an Agent keeps the agent-preset revision it joined. When a
 * plugin row inside a preset restarts (config edit, package update, newly
 * installed plugin), the registry retires the old revision but cannot free it
 * while a live Agent still holds a reference, so an already-open session keeps
 * running the old tools and prompt sections until it is recreated.
 *
 * `agentPresets.recompose(agent.ctx, id)` rebinds one Agent to the current
 * revision and releases the retired tree. This plugin exposes that as one call
 * over the authenticated `/api` carrier so the sidebar can trigger it.
 */

const CHANNEL = '/api'
const ENDPOINT = 'dsh-preset-sync'

export const name = 'preset-sync'
export const inject = ['connection']

/** Read the live Agent registry, or null when it is not composed here. */
function liveAgents(ctx) {
  const agents = ctx.get('agents')
  if (agents === undefined || typeof agents.list !== 'function') return null
  try {
    return agents.list()
  } catch {
    return null
  }
}

/** A comparable fingerprint of the composition one Agent currently runs. */
function compositionSignature(presets, agent) {
  try {
    const rows = presets.inspectCompositions(agent.ctx)
    return JSON.stringify(rows.map((row) => [row.id, (row.modules ?? []).length]))
  } catch {
    return null
  }
}

/** Preset identity this Agent runs and the one its session recorded. */
function presetIdentity(presets, agent) {
  let recorded = null
  let bound = null
  try {
    recorded = presets.presetForSession(agent.session) ?? null
  } catch {
    recorded = null
  }
  try {
    bound = presets.composedPreset(agent.ctx) ?? null
  } catch {
    bound = null
  }
  return { recorded, bound }
}

/** Describe one live Agent without changing it. */
function describe(presets, agent) {
  const identity = presetIdentity(presets, agent)
  return {
    sessionId: agent.id,
    status: agent.status,
    preset: identity.recorded ?? identity.bound,
    recordedPreset: identity.recorded,
    boundPreset: identity.bound,
    synced: identity.recorded !== null && identity.recorded === identity.bound,
  }
}

/** Let a pending profile recomposition settle before rebinding. */
async function settle(ctx, milliseconds) {
  const loader = ctx.get('loader')
  if (loader !== undefined && typeof loader.await === 'function') {
    try {
      await Promise.race([
        loader.await(),
        new Promise((resolve) => setTimeout(resolve, 3000).unref?.()),
      ])
    } catch {
      // A Loader that is mid-transaction rejects or waits; the delay below covers it.
    }
  }
  if (milliseconds > 0) await new Promise((resolve) => setTimeout(resolve, milliseconds).unref?.())
}

/** Rebind one Agent to the current revision of the preset it already uses. */
async function syncOne(presets, agent, options) {
  const identity = presetIdentity(presets, agent)
  const target = identity.recorded ?? identity.bound
  const base = {
    sessionId: agent.id,
    status: agent.status,
    preset: target,
  }
  if (target === null) {
    return { ...base, outcome: 'skipped', reason: 'no-preset' }
  }
  if (options.skipRunning && agent.status === 'running') {
    return { ...base, outcome: 'skipped', reason: 'running' }
  }
  const before = compositionSignature(presets, agent)
  try {
    await presets.recompose(agent.ctx, target)
  } catch (error) {
    return { ...base, outcome: 'failed', reason: String(error?.message ?? error) }
  }
  const after = compositionSignature(presets, agent)
  const changed = before !== null && after !== null ? before !== after : null
  return { ...base, outcome: 'synced', changed }
}

/** Build the RPC handler shared by every endpoint. */
function createHandler(ctx, config) {
  const skipRunning = config.skipRunning !== false
  const settleMs = Number.isFinite(config.settleMs) ? config.settleMs : 1200

  return async function handle(method, payload, signal) {
    const presets = ctx.get('agentPresets')
    if (presets === undefined) {
      return { ok: false, error: { code: 'preset-sync/no-presets', message: '这个 profile 没有装配 agent 预设注册表。' } }
    }
    const agents = liveAgents(ctx)
    if (agents === null) {
      return { ok: false, error: { code: 'preset-sync/no-agents', message: 'Agent 注册表当前不可用。' } }
    }

    if (method === 'sync.preview') {
      return {
        ok: true,
        value: {
          sessions: agents.map((agent) => describe(presets, agent)),
          skipRunning,
        },
      }
    }

    if (method === 'sync.run') {
      if (signal?.aborted) return { ok: false, error: { code: 'cancelled', message: '已取消。' } }
      const requested = Array.isArray(payload?.sessionIds) ? new Set(payload.sessionIds) : null
      const targets = requested === null ? agents : agents.filter((agent) => requested.has(agent.id))
      await settle(ctx, settleMs)
      const results = []
      for (const agent of targets) {
        if (signal?.aborted) break
        results.push(await syncOne(presets, agent, { skipRunning }))
      }
      const count = (outcome) => results.filter((row) => row.outcome === outcome).length
      return {
        ok: true,
        value: {
          results,
          total: results.length,
          synced: count('synced'),
          skipped: count('skipped'),
          failed: count('failed'),
          cancelled: signal?.aborted === true,
        },
      }
    }

    return { ok: false, error: { code: 'gateway/bad-request', message: `未知方法：${String(method)}` } }
  }
}

/** Normalize a handler result into the envelope the Client expects. */
function reply(rpcId, result) {
  const value = result.ok === false
    ? { ...result, error: { ...result.error, details: result.error?.details ?? {} } }
    : result
  return Response.json({ type: 'server-response', rpcId, result: value })
}

export function apply(ctx, config = {}) {
  const connection = ctx.get('connection')
  const registry = connection?.fetch
  if (registry === undefined || typeof registry.register !== 'function') {
    ctx.logger?.warn?.('preset-sync: 这个 profile 没有可用的 /api 载体，侧边栏入口将无法工作。')
    return
  }

  const handler = createHandler(ctx, config)

  ctx.effect(() => registry.register({
    path: `${CHANNEL}/${ENDPOINT}`,
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      if (request.method !== 'POST') return new Response('method not allowed', { status: 405 })
      let message
      try {
        message = await request.json()
      } catch {
        return new Response('body is not JSON', { status: 400 })
      }
      const rpcId = typeof message?.rpcId === 'string' ? message.rpcId : 'invalid-request'
      const call = message?.payload
      if (message?.type !== 'client-request' || typeof message.rpcId !== 'string'
        || message?.method !== ENDPOINT || call === null || typeof call !== 'object'
        || typeof call.method !== 'string' || !Object.hasOwn(call, 'payload')) {
        return reply(rpcId, { ok: false, error: { code: 'gateway/bad-request', message: 'Invalid preset-sync request.' } })
      }
      try {
        return reply(rpcId, await handler(call.method, call.payload, request.signal))
      } catch (error) {
        return reply(rpcId, {
          ok: false,
          error: { code: 'preset-sync/failed', message: String(error?.message ?? error) },
        })
      }
    },
  }), 'preset-sync: rpc route')
}
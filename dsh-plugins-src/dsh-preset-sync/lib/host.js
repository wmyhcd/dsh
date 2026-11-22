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
 * revision and releases the retired tree.
 *
 * The session list comes from `sessionController.list()`, which reports every
 * session plus `agentAvailable` — a blank session has no Agent at all, so
 * `agents.list()` alone could never show a newly created session.
 */

const CHANNEL = '/api'
const ENDPOINT = 'dsh-preset-sync'
const SETTLE_CAP_MS = 1500

export const name = 'preset-sync'
export const inject = ['connection']

function abortSignal(signal) {
  return signal ?? new AbortController().signal
}

/**
 * Sessions the user archived. `sessionController.list()` deliberately keeps
 * them (they still exist and can be unarchived), so the panel has to drop them
 * itself, otherwise an archived session never leaves the list.
 */
function archivedSessionIds(ctx) {
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) return null
  try {
    const ids = registry.archivedSessionIds
    return ids === undefined || ids === null ? null : new Set(Array.from(ids, String))
  } catch (error) {
    ctx.logger?.warn?.(`preset-sync: archivedSessionIds unavailable: ${String(error?.message ?? error)}`)
    return null
  }
}

/**
 * Read every ordinary session with live-Agent availability.
 * Falls back to the live Agent registry when the controller is unavailable or
 * refuses the read, so the panel still shows something useful.
 */
async function readSessions(ctx, signal) {
  const archived = archivedSessionIds(ctx)
  const controller = ctx.get('sessionController')
  if (controller !== undefined && typeof controller.list === 'function') {
    try {
      const value = await controller.list({}, abortSignal(signal))
      const rows = []
      for (const item of value?.items ?? []) {
        // Subagents are not user sessions; rebinding them is the parent's job.
        if (item.origin === 'subagent' || item.parentSessionId !== undefined) continue
        const sessionId = String(item.sessionId)
        if (archived !== null && archived.has(sessionId)) continue
        rows.push({
          sessionId,
          running: item.running === true,
          blank: item.blank === true,
          live: item.agentAvailable === true,
          updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : null,
        })
      }
      return { source: 'sessionController', rows, archivedFiltered: archived !== null }
    } catch (error) {
      ctx.logger?.warn?.(`preset-sync: sessionController.list() failed, falling back to live agents: ${String(error?.message ?? error)}`)
    }
  }
  const agents = ctx.get('agents')
  const live = agents !== undefined && typeof agents.list === 'function' ? agents.list() : []
  return {
    source: 'agents',
    rows: live
      .filter((agent) => archived === null || !archived.has(String(agent.id)))
      .map((agent) => ({
        sessionId: String(agent.id),
        running: agent.status === 'running',
        blank: false,
        live: true,
        updatedAt: null,
      })),
    archivedFiltered: archived !== null,
  }
}

/** Preset identity a live Agent runs, plus the one its session recorded. */
function presetIdentity(presets, agent) {
  let recorded = null
  let bound = null
  if (agent === undefined) return { recorded, bound }
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

/** Let a pending profile recomposition settle before rebinding. */
async function settle(ctx, milliseconds) {
  const loader = ctx.get('loader')
  if (loader !== undefined && typeof loader.await === 'function') {
    try {
      await Promise.race([
        loader.await(),
        new Promise((resolve) => setTimeout(resolve, SETTLE_CAP_MS).unref?.()),
      ])
    } catch {
      // A Loader mid-transaction either rejects or waits; the delay covers it.
    }
  }
  if (milliseconds > 0) await new Promise((resolve) => setTimeout(resolve, milliseconds).unref?.())
}

/** Rebind one Agent to the current revision of the preset it already uses. */
async function syncOne(ctx, presets, row, options) {
  const base = { sessionId: row.sessionId, running: row.running, live: row.live }
  const agent = ctx.get('agents')?.get?.(row.sessionId)
  if (agent === undefined) {
    return { ...base, outcome: 'skipped', reason: 'no-agent' }
  }
  const identity = presetIdentity(presets, agent)
  const target = identity.recorded ?? identity.bound
  base.preset = target
  if (target === null) {
    return { ...base, outcome: 'skipped', reason: 'no-preset' }
  }
  if (options.skipRunning && (row.running || agent.status === 'running')) {
    return { ...base, outcome: 'skipped', reason: 'running' }
  }
  try {
    await presets.recompose(agent.ctx, target)
    return { ...base, outcome: 'synced' }
  } catch (error) {
    const message = String(error?.message ?? error)
    ctx.logger?.warn?.(`preset-sync: recompose failed for ${row.sessionId}: ${message}`)
    return { ...base, outcome: 'failed', reason: message }
  }
}

/** Build the RPC handler shared by the HTTP route and the agent tool. */
function createService(ctx, config) {
  const skipRunning = config.skipRunning !== false
  const settleMs = Number.isFinite(config.settleMs) ? config.settleMs : 300

  async function preview(signal) {
    const presets = ctx.get('agentPresets')
    if (presets === undefined) throw new Error('这个 profile 没有装配 agent 预设注册表。')
    const { source, rows, archivedFiltered } = await readSessions(ctx, signal)
    const agents = ctx.get('agents')
    const sessions = rows.map((row) => {
      const agent = row.live ? agents?.get?.(row.sessionId) : undefined
      const identity = presetIdentity(presets, agent)
      return {
        sessionId: row.sessionId,
        running: row.running,
        blank: row.blank,
        live: row.live,
        updatedAt: row.updatedAt,
        preset: identity.recorded ?? identity.bound,
        recordedPreset: identity.recorded,
        boundPreset: identity.bound,
      }
    })
    const live = sessions.filter((row) => row.live).length
    ctx.logger?.info?.(`preset-sync: preview source=${source} sessions=${sessions.length} live=${live} archivedFilter=${archivedFiltered}`)
    return { source, sessions, skipRunning, archivedFiltered }
  }

  async function run(payload, signal) {
    const presets = ctx.get('agentPresets')
    if (presets === undefined) throw new Error('这个 profile 没有装配 agent 预设注册表。')
    const { rows } = await readSessions(ctx, signal)
    const requested = Array.isArray(payload?.sessionIds) ? new Set(payload.sessionIds.map(String)) : null
    const targets = requested === null ? rows : rows.filter((row) => requested.has(row.sessionId))
    await settle(ctx, settleMs)
    const results = []
    for (const row of targets) {
      if (signal?.aborted) break
      results.push(await syncOne(ctx, presets, row, { skipRunning }))
    }
    const count = (outcome) => results.filter((row) => row.outcome === outcome).length
    const summary = {
      results,
      total: results.length,
      synced: count('synced'),
      skipped: count('skipped'),
      failed: count('failed'),
      cancelled: signal?.aborted === true,
    }
    ctx.logger?.info?.(`preset-sync: run total=${summary.total} synced=${summary.synced} skipped=${summary.skipped} failed=${summary.failed}`)
    return summary
  }

  return {
    async handle(method, payload, signal) {
      try {
        if (method === 'sync.preview') return { ok: true, value: await preview(signal) }
        if (method === 'sync.run') return { ok: true, value: await run(payload, signal) }
        return { ok: false, error: { code: 'gateway/bad-request', message: `未知方法：${String(method)}` } }
      } catch (error) {
        const message = String(error?.message ?? error)
        return { ok: false, error: { code: 'preset-sync/failed', message } }
      }
    },
    preview,
    run,
  }
}

/** Normalize a handler result into the envelope the Client expects. */
function reply(rpcId, result) {
  const value = result.ok === false
    ? { ...result, error: { ...result.error, details: result.error?.details ?? {} } }
    : result
  return Response.json({ type: 'server-response', rpcId, result: value })
}

function sameSessionIds(found) {
  return Number.isFinite(found.synced) ? String(found.synced) : '?'
}

/** Agent-facing entry so the same operation is reachable without the panel. */
function registerTool(ctx, service) {
  const tools = ctx.get('tools')
  if (tools === undefined || typeof tools.register !== 'function') return
  try {
    ctx.effect(() => tools.register({
      name: 'preset_sync',
      description:
        'Rebind open DSH sessions to the current plugin configuration and agent preset revision. '
        + 'Use action "status" to list sessions (with live-Agent availability), "run" to sync them.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: '"status" (default) or "run".' },
          sessionIds: { type: 'array', items: { type: 'string' }, description: 'Optional subset to sync.' },
        },
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            action: { type: 'string' },
            summary: { type: 'string' },
            detail: { type: 'string' },
          },
          additionalProperties: false,
        },
        render(_args, value) {
          return [{ type: 'text', text: String(value?.summary ?? '') }]
        },
      },
      async execute(args) {
        const action = args?.action === 'run' ? 'run' : 'status'
        try {
          if (action === 'run') {
            const value = await service.run({ sessionIds: args?.sessionIds })
            return {
              action,
              summary: `同步完成：共 ${value.total} 个会话，已同步 ${value.synced}，跳过 ${value.skipped}，失败 ${value.failed}。`,
              detail: JSON.stringify(value.results),
            }
          }
          const value = await service.preview()
          const live = value.sessions.filter((row) => row.live).length
          return {
            action,
            summary: `共 ${value.sessions.length} 个会话，其中 ${live} 个开着（有活跃 Agent，可同步）。列表来源：${value.source}。`,
            detail: JSON.stringify(value.sessions),
          }
        } catch (error) {
          return { action, summary: `失败：${String(error?.message ?? error)}`, detail: '{}' }
        }
      },
    }), 'preset-sync: tool')
  } catch (error) {
    ctx.logger?.warn?.(`preset-sync: 注册工具失败（不影响面板）：${String(error?.message ?? error)}`)
  }
}

export function apply(ctx, config = {}) {
  const service = createService(ctx, config)
  registerTool(ctx, service)

  const registry = ctx.get('connection')?.fetch
  if (registry === undefined || typeof registry.register !== 'function') {
    ctx.logger?.warn?.('preset-sync: 这个 profile 没有可用的 /api 载体，侧边栏入口将无法工作。')
    return
  }

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
      return reply(rpcId, await service.handle(call.method, call.payload, request.signal))
    },
  }), 'preset-sync: rpc route')
}
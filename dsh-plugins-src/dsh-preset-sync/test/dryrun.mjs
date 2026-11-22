/**
 * Dry-run harness for dsh-preset-sync.
 *
 * Runs the real Host and Client code against stub services so logic errors
 * surface here instead of in the GUI. No DSH process is required.
 *
 *   node test/dryrun.mjs
 */
import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const specifier = (file) => pathToFileURL(join(here, '..', file)).href + '?t=' + Date.now()

// ---------------------------------------------------------------- fixtures
const calls = []
const agentOf = {
  s1: { id: 's1', status: 'idle', session: { sid: 's1' }, ctx: { tag: '1' } },
  s2: { id: 's2', status: 'running', session: { sid: 's2' }, ctx: { tag: '2' } },
  s4: { id: 's4', status: 'idle', session: { sid: 's4' }, ctx: { tag: '4' } },
}
// s3 has no Agent at all (blank / never opened); s5 is a subagent session.
const sessionRows = [
  { sessionId: 's1', agentAvailable: true, running: false, blank: false, updatedAt: 3 },
  { sessionId: 's2', agentAvailable: true, running: true, blank: false, updatedAt: 2 },
  { sessionId: 's3', agentAvailable: false, running: false, blank: true, updatedAt: 1 },
  { sessionId: 's4', agentAvailable: true, running: false, blank: false, updatedAt: 0 },
  { sessionId: 's5', agentAvailable: true, running: false, blank: false, origin: 'subagent', updatedAt: 0 },
]
const presets = {
  presetForSession: (session) => (session.sid === 's4' ? null : 'standard'),
  composedPreset: (agentCtx) => (agentCtx.tag === '4' ? undefined : 'standard'),
  recompose: async (agentCtx, id) => {
    calls.push([agentCtx.tag, id])
    return { id }
  },
}

let route
const registeredTools = []
function makeCtx({ controller = { list: async () => ({ items: sessionRows }) } } = {}) {
  return {
    get(name) {
      if (name === 'connection') {
        return { fetch: { register(value) { route = value; return () => { route = undefined } } } }
      }
      if (name === 'sessionController') return controller
      if (name === 'agents') {
        return { list: () => Object.values(agentOf), get: (id) => agentOf[id] }
      }
      if (name === 'agentPresets') return presets
      if (name === 'tools') {
        return {
          register(definition) {
            registeredTools.push(definition)
            return () => {}
          },
        }
      }
      if (name === 'loader') return undefined
      return undefined
    },
    effect(fn) { return fn() },
    logger: { warn() {}, info() {} },
  }
}

const request = (payload) => ({ method: 'POST', signal: { aborted: false }, json: async () => payload })
const envelope = (method, payload) => ({
  type: 'client-request', rpcId: 'r1', method: 'dsh-preset-sync', payload: { method, payload },
})

// ------------------------------------------------------------- Host: reads
const host = await import(specifier('lib/index.js'))
assert.equal(typeof host.apply, 'function', 'host exports apply')
assert.deepEqual(host.inject, ['connection'], 'host declares connection')

host.apply(makeCtx(), { skipRunning: true, settleMs: 0 })
assert.ok(route, 'host registered a route')
assert.equal(route.path, '/api/dsh-preset-sync')
assert.deepEqual(route.methods, ['POST'])

const preview = await (await route.fetch(request(envelope('sync.preview', {})))).json()
assert.equal(preview.result.ok, true, 'preview ok')
assert.equal(preview.result.value.source, 'sessionController', 'reads the session controller first')
const listed = preview.result.value.sessions
assert.deepEqual(listed.map((row) => row.sessionId), ['s1', 's2', 's3', 's4'],
  'lists every ordinary session including one with no Agent, and drops the subagent')
assert.deepEqual(listed.map((row) => [row.sessionId, row.live]), [['s1', true], ['s2', true], ['s3', false], ['s4', true]],
  'reports live-Agent availability per session')
assert.equal(listed[2].preset, null, 'a session with no Agent carries no preset')
assert.equal(listed[3].preset, null, 'a preset-free Agent reports no preset')

// ------------------------------------------------------------- Host: write
const run = await (await route.fetch(request(envelope('sync.run', {})))).json()
assert.equal(run.result.ok, true, 'run ok')
assert.equal(run.result.value.total, 4)
assert.equal(run.result.value.synced, 1, 'only the idle preset-bound Agent is rebound')
assert.equal(run.result.value.failed, 0)
assert.deepEqual(run.result.value.results.map((row) => [row.sessionId, row.outcome, row.reason ?? null]), [
  ['s1', 'synced', null],
  ['s2', 'skipped', 'running'],
  ['s3', 'skipped', 'no-agent'],
  ['s4', 'skipped', 'no-preset'],
], 'each session reports its own outcome')
assert.deepEqual(calls, [['1', 'standard']], 'recompose runs once, for the idle preset-bound Agent')

const scoped = await (await route.fetch(request(envelope('sync.run', { sessionIds: ['s1', 's3'] })))).json()
assert.equal(scoped.result.value.total, 2, 'sessionIds narrows the batch')

const bad = await (await route.fetch(request(envelope('sync.bogus', {})))).json()
assert.equal(bad.result.ok, false, 'unknown method is refused')
assert.equal(bad.result.error.details !== undefined, true, 'error carries a details field')

const invalid = await (await route.fetch(request({ type: 'client-request', rpcId: 'r2' }))).json()
assert.equal(invalid.result.ok, false, 'malformed envelope refused')
console.log('HOST OK — recompose targets:', JSON.stringify(calls))

// --------------------------------------------------------- Host: fallback
route = undefined
host.apply(makeCtx({ controller: { list: async () => { throw new Error('boom') } } }), { skipRunning: true, settleMs: 0 })
const fallback = await (await route.fetch(request(envelope('sync.preview', {})))).json()
assert.equal(fallback.result.ok, true, 'preview survives a controller failure')
assert.equal(fallback.result.value.source, 'agents', 'falls back to the live Agent registry')
assert.deepEqual(fallback.result.value.sessions.map((row) => row.sessionId).sort(), ['s1', 's2', 's4'],
  'fallback lists live Agents only')
console.log('FALLBACK OK — source:', fallback.result.value.source)

// ---------------------------------------------------------------- Host tool
assert.ok(registeredTools.some((tool) => tool.name === 'preset_sync'), 'registers the preset_sync tool')
const tool = registeredTools.find((entry) => entry.name === 'preset_sync')
assert.equal(typeof tool.output.render, 'function', 'tool declares a renderer')

route = undefined
host.apply(makeCtx(), { skipRunning: true, settleMs: 0 })
const statusTool = registeredTools.filter((entry) => entry.name === 'preset_sync').pop()
const statusValue = await statusTool.execute({ action: 'status' })
assert.equal(statusValue.action, 'status')
assert.match(statusValue.summary, /4 个会话/, 'status tool reports the session count')
assert.match(statusValue.summary, /3 个开着/, 'status tool reports how many are open')
assert.ok(Array.isArray(tool.output.render(statusValue, statusValue)), 'render returns content blocks')
console.log('TOOL OK —', statusValue.summary)

// -------------------------------------------------------------- Client half
const registrations = []
let loaded
globalThis.window = { __ModuleLoader__: { load(def) { loaded = def } } }
const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => [initial, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
  useId: () => 'id',
}
const fakeRequire = (name) => {
  if (name === 'react') return fakeReact
  throw new Error('unexpected external: ' + name)
}

await import(specifier('lib/client.js'))
assert.ok(loaded, 'client registered a factory')
assert.equal(loaded.id, 'dsh-preset-sync', 'factory id equals package name')

const plugin = loaded.factory(fakeRequire)
assert.deepEqual(plugin.inject, ['slots', 'connection'], 'client declares slots and connection')
assert.equal(typeof plugin.apply, 'function')

const clientCtx = {
  connection: { rpc: { call: () => Promise.resolve({ ok: true, value: { sessions: [] } }) } },
  inject(names, callback) {
    assert.deepEqual(names, ['layout'], 'waits for the layout service')
    callback(clientCtx)
  },
  slots: {
    inject(name, callback) { callback(); return () => {} },
    register(declaration) { registrations.push(declaration); return () => {} },
  },
}
plugin.apply(clientCtx)
assert.deepEqual(registrations.map((row) => row.name), ['main', 'sidebar.panellist'],
  'registers the panel and the sidebar row')
assert.equal(registrations[0].key, 'dsh-preset-sync')
assert.equal(registrations[1].id, 'dsh-preset-sync')
assert.equal(typeof registrations[1].label, 'string')
console.log('CLIENT OK — registrations:', JSON.stringify(registrations.map((r) => r.name)))
console.log('\nALL CHECKS PASSED')
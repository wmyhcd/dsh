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

// ---------------------------------------------------------------- Host half
const calls = []
const agents = [
  { id: 'session-a', status: 'idle', session: { header: {} }, ctx: { tag: 'a' } },
  { id: 'session-b', status: 'running', session: { header: {} }, ctx: { tag: 'b' } },
  { id: 'session-c', status: 'idle', session: { header: {} }, ctx: { tag: 'c' } },
]
const presets = {
  presetForSession: (session) => (session === agents[2].session ? null : 'standard'),
  composedPreset: (agentCtx) => (agentCtx.tag === 'c' ? undefined : 'standard'),
  inspectCompositions: (agentCtx) => [{ id: 'standard', modules: [{ m: agentCtx.tag }], leakedServices: [] }],
  recompose: async (agentCtx, id) => {
    calls.push([agentCtx.tag, id])
    return { id }
  },
}

let route
const ctx = {
  get(name) {
    if (name === 'connection') {
      return { fetch: { register(value) { route = value; return () => { route = undefined } } } }
    }
    if (name === 'agents') return { list: () => agents }
    if (name === 'agentPresets') return presets
    if (name === 'loader') return undefined
    return undefined
  },
  effect(fn) { return fn() },
  logger: { warn() {}, info() {} },
}

const host = await import(specifier('lib/index.js'))
assert.equal(typeof host.apply, 'function', 'host exports apply')
assert.deepEqual(host.inject, ['connection'], 'host declares connection')

host.apply(ctx, { skipRunning: true, settleMs: 0 })
assert.ok(route, 'host registered a route')
assert.equal(route.path, '/api/dsh-preset-sync')
assert.deepEqual(route.methods, ['POST'])

const request = (payload) => ({
  method: 'POST',
  signal: { aborted: false },
  json: async () => payload,
})
const envelope = (method, payload) => ({
  type: 'client-request', rpcId: 'r1', method: 'dsh-preset-sync', payload: { method, payload },
})

const preview = await (await route.fetch(request(envelope('sync.preview', {})))).json()
assert.equal(preview.type, 'server-response')
assert.equal(preview.result.ok, true, 'preview ok')
assert.equal(preview.result.value.sessions.length, 3, 'preview lists every live agent')
assert.deepEqual(
  preview.result.value.sessions.map((row) => [row.sessionId, row.preset, row.synced]),
  [['session-a', 'standard', true], ['session-b', 'standard', true], ['session-c', null, false]],
  'preview describes preset identity',
)

const run = await (await route.fetch(request(envelope('sync.run', {})))).json()
assert.equal(run.result.ok, true, 'run ok')
assert.equal(run.result.value.total, 3)
assert.equal(run.result.value.synced, 1, 'the one idle preset-bound agent is rebound')
assert.equal(run.result.value.skipped, 2, 'running agent and preset-free agent are skipped')
assert.equal(run.result.value.failed, 0)
assert.deepEqual(run.result.value.results.map((row) => [row.sessionId, row.outcome, row.reason ?? null]), [
  ['session-a', 'synced', null],
  ['session-b', 'skipped', 'running'],
  ['session-c', 'skipped', 'no-preset'],
], 'each agent reports its own outcome')
assert.deepEqual(calls, [['a', 'standard']], 'recompose called only for the idle preset-bound agent')

const scoped = await (await route.fetch(request(envelope('sync.run', { sessionIds: ['session-a'] })))).json()
assert.equal(scoped.result.value.total, 1, 'sessionIds narrows the batch')

const bad = await (await route.fetch(request(envelope('sync.bogus', {})))).json()
assert.equal(bad.result.ok, false, 'unknown method is refused')
assert.equal(bad.result.error.details !== undefined, true, 'error carries a details field')

const invalid = await (await route.fetch(request({ type: 'client-request', rpcId: 'r2' }))).json()
assert.equal(invalid.result.ok, false, 'malformed envelope refused')
console.log('HOST OK — recompose targets:', JSON.stringify(calls))

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
    inject(name, callback) {
      callback()
      return () => {}
    },
    register(declaration) {
      registrations.push(declaration)
      return () => {}
    },
  },
}
plugin.apply(clientCtx)
assert.deepEqual(
  registrations.map((row) => row.name),
  ['main', 'sidebar.panellist'],
  'registers the panel and the sidebar row',
)
assert.equal(registrations[0].key, 'dsh-preset-sync')
assert.equal(registrations[1].id, 'dsh-preset-sync')
assert.equal(typeof registrations[1].label, 'string')
console.log('CLIENT OK — registrations:', JSON.stringify(registrations.map((r) => r.name)))
console.log('\nALL CHECKS PASSED')
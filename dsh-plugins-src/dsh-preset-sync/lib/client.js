/**
 * dsh-preset-sync — Client half.
 *
 * Adds one row to the sidebar panel list (the same list the IM bot entry uses)
 * and a panel with one button that rebinds every live session to the current
 * plugin configuration.
 */
window.__ModuleLoader__.load({
  id: 'dsh-preset-sync',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const PANEL_ID = 'dsh-preset-sync'
    const ENDPOINT = 'dsh-preset-sync'

    const BORDER = 'var(--dsw-alias-border-l2, rgba(128,128,128,.28))'
    const MUTED = 'var(--dsw-alias-text-secondary, rgba(128,128,128,.95))'
    const ACCENT = 'var(--dsw-alias-brand-primary, #4f7cff)'
    const SURFACE = 'var(--dsw-alias-bg-module, rgba(127,127,127,.08))'
    const WARN = 'var(--dsw-alias-text-warning, #f5a524)'
    const BAD = 'var(--dsw-alias-text-error, #e5484d)'
    const OK = 'var(--dsw-alias-text-success, #30a46c)'

    function callRpc(connection, method, payload, signal) {
      return connection.rpc.call('/api', ENDPOINT, { method, payload }, signal)
    }

    function unwrap(result) {
      if (result === null || typeof result !== 'object') throw new Error('同步服务返回了无法识别的响应。')
      if (result.ok !== true) throw new Error(result.error?.message || '同步请求失败。')
      return result.value
    }

    function shortId(id) {
      const text = String(id ?? '')
      return text.length > 18 ? `${text.slice(0, 8)}…${text.slice(-6)}` : text
    }

    function SyncIcon({ size }) {
      const pixels = typeof size === 'number' && size > 0 ? size : 16
      return h('svg', {
        width: pixels, height: pixels, viewBox: '0 0 16 16',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.3,
        strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, focusable: false,
      },
        h('path', { d: 'M13.2 7.2a5.2 5.2 0 0 0-9-3.3L2.8 5.4' }),
        h('path', { d: 'M2.8 2.4v3h3' }),
        h('path', { d: 'M2.8 8.8a5.2 5.2 0 0 0 9 3.3l1.4-1.5' }),
        h('path', { d: 'M13.2 13.6v-3h-3' }))
    }

    function dot(color) {
      return h('span', {
        'aria-hidden': true,
        style: {
          display: 'inline-block', width: 6, height: 6, borderRadius: 999,
          background: color, flex: '0 0 auto',
        },
      })
    }

    /** State of one session row: running → no agent → ready. */
    function rowState(row) {
      if (row.live === false) return { color: MUTED, label: '未打开', hint: '打开即用最新配置' }
      if (row.running) return { color: WARN, label: '运行中', hint: '会跳过，等空闲再同步' }
      return { color: OK, label: '空闲', hint: '可同步' }
    }

    function SyncPanel({ connection }) {
      const [phase, setPhase] = React.useState('loading')
      const [sessions, setSessions] = React.useState([])
      const [message, setMessage] = React.useState(null)
      const [report, setReport] = React.useState(null)
      const [busy, setBusy] = React.useState(false)

      const load = React.useCallback(async (signal) => {
        setPhase('loading')
        setMessage(null)
        try {
          const value = unwrap(await callRpc(connection, 'sync.preview', {}, signal))
          if (signal?.aborted) return
          const rows = Array.isArray(value.sessions) ? value.sessions : []
          setSessions(rows)
          setPhase('ready')
        } catch (error) {
          if (signal?.aborted) return
          setPhase('error')
          setMessage(String(error?.message ?? error))
        }
      }, [connection])

      React.useEffect(() => {
        const abort = new AbortController()
        void load(abort.signal)
        return () => abort.abort()
      }, [load])

      const run = React.useCallback(async () => {
        if (busy) return
        setBusy(true)
        setMessage(null)
        setReport(null)
        try {
          const value = unwrap(await callRpc(connection, 'sync.run', {}))
          setReport(value)
          const failed = Number(value?.failed ?? 0)
          setMessage(failed > 0
            ? `已同步 ${value.synced} 个，${failed} 个失败（见下方明细）。`
            : `已同步 ${value.synced} 个，跳过 ${value.skipped} 个。`)
          await load()
        } catch (error) {
          setMessage(String(error?.message ?? error))
        } finally {
          setBusy(false)
        }
      }, [busy, connection, load])

      const liveCount = sessions.filter((row) => row.live).length
      const failedRows = report?.results?.filter((row) => row.outcome === 'failed') ?? []

      const rows = sessions.map((row) => {
        const state = rowState(row)
        return h('li', {
          key: row.sessionId,
          style: {
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 10px', borderTop: `1px solid ${BORDER}`,
            font: 'inherit', fontSize: 12,
          },
        },
          dot(state.color),
          h('code', { style: { fontSize: 12, flex: '1 1 auto', opacity: 0.9 } }, shortId(row.sessionId)),
          h('span', { style: { color: row.preset === null ? MUTED : 'inherit', fontSize: 11, whiteSpace: 'nowrap' } },
            row.preset === null ? '无预设' : row.preset),
          h('span', {
            title: state.hint,
            style: { color: state.color, fontSize: 11, minWidth: 46, textAlign: 'right', whiteSpace: 'nowrap' },
          }, state.label))
      })

      return h('div', {
        style: {
          display: 'flex', flexDirection: 'column', gap: 14,
          padding: '20px 22px', font: 'inherit', maxWidth: 760,
        },
      },
        h('div', null,
          h('h2', { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, '会话同步'),
          h('p', { style: { margin: '6px 0 0', color: MUTED, fontSize: 12, lineHeight: 1.6 } },
            '让已经打开的会话立刻换上最新的插件配置和 agent 预设。改完插件设置或装好新插件后点一下即可，不需要重开会话。')),

        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
          h('button', {
            type: 'button',
            onClick: run,
            disabled: busy || phase === 'loading',
            style: {
              appearance: 'none', border: 'none', borderRadius: 8,
              padding: '8px 16px', fontSize: 13, fontWeight: 600,
              cursor: busy ? 'default' : 'pointer',
              color: '#fff', background: ACCENT,
              opacity: busy || phase === 'loading' ? 0.6 : 1,
            },
          }, busy ? '同步中…' : '同步所有会话'),
          h('button', {
            type: 'button',
            onClick: () => void load(),
            disabled: busy || phase === 'loading',
            style: {
              appearance: 'none', border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: '8px 14px', fontSize: 13, cursor: 'pointer',
              color: 'inherit', background: 'transparent',
            },
          }, '刷新列表'),
          h('span', { style: { color: MUTED, fontSize: 12 } },
            phase === 'loading'
              ? '正在读取会话…'
              : `共 ${sessions.length} 个会话，${liveCount} 个开着`)),

        message === null ? null : h('div', {
          role: 'status',
          style: {
            padding: '9px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.6,
            background: SURFACE, border: `1px solid ${BORDER}`,
          },
        }, message),

        failedRows.length === 0 ? null : h('ul', {
          style: { margin: 0, padding: 0, listStyle: 'none', border: `1px solid ${BORDER}`, borderRadius: 8 },
        }, failedRows.map((row) => h('li', {
          key: `fail-${row.sessionId}`,
          style: { padding: '7px 10px', fontSize: 12, color: BAD, borderTop: `1px solid ${BORDER}` },
        }, `${shortId(row.sessionId)}：${row.reason}`))),

        sessions.length === 0
          ? h('p', { style: { color: MUTED, fontSize: 12, margin: 0 } },
            phase === 'loading' ? '' : '还没有会话。')
          : h('ul', {
            style: { margin: 0, padding: 0, listStyle: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' },
          }, rows),

        h('p', { style: { color: MUTED, fontSize: 11, lineHeight: 1.6, margin: 0 } },
          '「未打开」的会话没有 Agent，打开时自然装配最新配置，不需要同步。正在跑的会话会被跳过，避免打断当前回合。'))
    }

    return {
      inject: ['slots', 'connection'],

      apply(ctx) {
        ctx.inject(['layout'], (pageCtx) => pageCtx.slots.inject('main', () => {
          const unregisterPage = pageCtx.slots.register({
            name: 'main',
            key: PANEL_ID,
            inject: () => ({ connection: ctx.connection }),
          }, SyncPanel)

          const stopSidebar = pageCtx.slots.inject('sidebar.panellist', () =>
            pageCtx.slots.register({
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 30,
              label: '会话同步',
            }, SyncIcon))

          return () => {
            stopSidebar()
            unregisterPage()
          }
        }))
      },
    }
  },
})
/**
 * dsh-skill-manager — host 侧
 *
 * 把本地 skill 的发现与开关做成两条 HTTP 路由，供设置面板调用。
 * 扫描根与 @deepseek-ai/dsh-skill-filesystem 保持一致：
 *   100 <project>/.dsh/skills
 *   200 <project>/.agents/skills
 *   400 <dshHome>/skills        (跳过 .system)
 *   500 <agentsHome>/skills
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const API_PREFIX = '/api/skill-manager'

/** @param {import('node:http').ServerResponse} res */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

function agentsHome() {
  return process.env.AGENTS_HOME || path.join(os.homedir(), '.agents')
}

function findProjectRoot(start) {
  let cur = path.resolve(start)
  for (;;) {
    if (fs.existsSync(path.join(cur, '.git'))) return cur
    const up = path.dirname(cur)
    if (up === cur) return path.resolve(start)
    cur = up
  }
}

function skillRoots(extraDirs = []) {
  const proj = findProjectRoot(process.cwd())
  const list = [
    { rank: 100, source: 'project-dsh', dir: path.join(proj, '.dsh', 'skills') },
    { rank: 200, source: 'project-agents', dir: path.join(proj, '.agents', 'skills') },
  ]
  for (const d of extraDirs) list.push({ rank: 300, source: 'custom', dir: path.resolve(d) })
  list.push(
    { rank: 400, source: 'user-dsh', dir: path.join(dshHome(), 'skills') },
    { rank: 500, source: 'user-agents', dir: path.join(agentsHome(), 'skills') },
  )
  return list
}

/** 解析 YAML frontmatter —— 只认顶层标量，够用且不引依赖 */
function parseFrontmatter(text) {
  if (!text.startsWith('---')) return { data: {}, body: text, hasFm: false }
  const end = text.indexOf('\n---', 3)
  if (end < 0) return { data: {}, body: text, hasFm: false }
  const raw = text.slice(3, end).replace(/^\r?\n/, '')
  const body = text.slice(end + 4).replace(/^\r?\n/, '')
  const data = {}
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if (!v) continue
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    data[m[1].toLowerCase()] = v
  }
  return { data, body, hasFm: true }
}

function boolish(v) {
  if (v === undefined || v === null) return undefined
  const s = String(v).trim().toLowerCase()
  if (['true', 'yes', 'on', '1'].includes(s)) return true
  if (['false', 'no', 'off', '0'].includes(s)) return false
  return undefined
}

function scanSkills(extraDirs) {
  const found = []
  for (const r of skillRoots(extraDirs)) {
    let entries = []
    try {
      entries = fs.readdirSync(r.dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (r.source === 'user-dsh' && e.name === '.system') continue
      const full = path.join(r.dir, e.name)
      let file = null
      if (e.isDirectory()) {
        const cand = path.join(full, 'SKILL.md')
        if (fs.existsSync(cand)) file = cand
      } else if (e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md') {
        file = full
      }
      if (!file) continue
      let text = ''
      try {
        text = fs.readFileSync(file, 'utf8')
      } catch {
        continue
      }
      const { data } = parseFrontmatter(text)
      const name = data.name || (e.isDirectory() ? e.name : e.name.replace(/\.md$/, ''))
      found.push({
        name,
        description: data.description || '',
        whenToUse: data.whenToUse || '',
        modelOff: boolish(data['disable-model-invocation']) === true,
        userOff: boolish(data['user-invocable']) === false,
        source: r.source,
        rank: r.rank,
        file,
      })
    }
  }
  const byName = new Map()
  for (const s of found.sort((a, b) => a.rank - b.rank)) {
    if (!byName.has(s.name)) byName.set(s.name, s)
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** 改写 frontmatter 里的一个布尔键 */
function setFrontmatterKey(file, key, value) {
  let text = fs.readFileSync(file, 'utf8')
  const fm = parseFrontmatter(text)
  const re = new RegExp(`^${key}\\s*:.*$`, 'im')
  if (!fm.hasFm) {
    text = `---\n${key}: ${value}\n---\n\n${text}`
  } else if (re.test(text)) {
    text = text.replace(re, `${key}: ${value}`)
  } else {
    text = text.replace(/^---[ \t]*$/m, `---\n${key}: ${value}`)
  }
  fs.writeFileSync(file, text, 'utf8')
}

async function readBody(req, limit = 64 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('payload too large')
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  return raw ? JSON.parse(raw) : {}
}

/**
 * @param {any} ctx cordis 上下文
 */
export function apply(ctx) {
  const extraDirs = () => {
    const cfg = ctx.config ?? {}
    const dirs = cfg.customSkillDirs
    if (Array.isArray(dirs)) return dirs.filter((d) => typeof d === 'string' && d)
    return []
  }

  ctx.inject(['webServer'], (webCtx) => {
    const route = {
      kind: 'prefix',
      path: API_PREFIX,
      async handler(req, res) {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const sub = url.pathname.slice(API_PREFIX.length).replace(/^\/+/, '')

        try {
          if (sub === 'list' && req.method === 'GET') {
            const skills = scanSkills(extraDirs()).map((s) => ({
              name: s.name,
              description: s.description,
              whenToUse: s.whenToUse,
              modelOff: s.modelOff,
              userOff: s.userOff,
              source: s.source,
              file: s.file,
            }))
            const roots = skillRoots(extraDirs()).map((r) => ({
              rank: r.rank,
              source: r.source,
              dir: r.dir,
              exists: fs.existsSync(r.dir),
            }))
            return sendJson(res, 200, { skills, roots })
          }

          if (sub === 'toggle' && req.method === 'POST') {
            const body = await readBody(req)
            const name = typeof body.name === 'string' ? body.name : ''
            const field = body.field
            const enabled = body.enabled === true
            if (!name) return sendJson(res, 400, { error: 'name required' })
            if (field !== 'model' && field !== 'user') {
              return sendJson(res, 400, { error: "field must be 'model' or 'user'" })
            }
            const target = scanSkills(extraDirs()).find((s) => s.name === name)
            if (!target) return sendJson(res, 404, { error: 'skill not found', name })
            if (field === 'model') {
              setFrontmatterKey(target.file, 'disable-model-invocation', String(!enabled))
            } else {
              setFrontmatterKey(target.file, 'user-invocable', String(enabled))
            }
            return sendJson(res, 200, { ok: true, name, field, enabled })
          }

          if (sub === 'preview' && req.method === 'GET') {
            const name = url.searchParams.get('name') ?? ''
            const target = scanSkills(extraDirs()).find((s) => s.name === name)
            if (!target) return sendJson(res, 404, { error: 'skill not found' })
            const text = fs.readFileSync(target.file, 'utf8')
            return sendJson(res, 200, {
              name: target.name,
              file: target.file,
              body: parseFrontmatter(text).body.slice(0, 8000),
            })
          }

          return sendJson(res, 404, { error: 'unknown endpoint' })
        } catch (error) {
          return sendJson(res, 500, { error: String(error?.message ?? error) })
        }
      },
    }
    webCtx.effect(() => webCtx.webServer.register(route), 'skill-manager: routes')
  })
}

export const inject = ['webServer']

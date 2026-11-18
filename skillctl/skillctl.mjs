#!/usr/bin/env node
/**
 * skillctl — DSH skill 管理器（命令行版）
 *
 * 用法:
 *   node skillctl.mjs list                    列出全部 skill（含状态）
 *   node skillctl.mjs show <name>             看某个 skill 的 frontmatter 与正文开头
 *   node skillctl.mjs disable <name>          模型不可调用（只留 /name 手动）
 *   node skillctl.mjs enable <name>           恢复模型可调用
 *   node skillctl.mjs hide <name>             人机都不显示（/ 菜单里消失）
 *   node skillctl.mjs unhide <name>           恢复 / 菜单可见
 *   node skillctl.mjs which <name>            这个 skill 实际读的是哪个文件
 *
 * 扫描根（与 dsh-skill-filesystem 一致，按优先级）:
 *   100  <project>/.dsh/skills
 *   200  <project>/.agents/skills
 *   400  <dshHome>/skills          (默认 ~/.dsh/skills，跳过 .system)
 *   500  <agentsHome>/skills       (默认 ~/.agents/skills)
 *   +   环境变量 SKILLCTL_EXTRA 里用路径分隔符分隔的额外目录
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const AGENTS_HOME = process.env.AGENTS_HOME || path.join(os.homedir(), '.agents')

function findProjectRoot(start) {
  let cur = path.resolve(start)
  for (;;) {
    if (fs.existsSync(path.join(cur, '.git'))) return cur
    const up = path.dirname(cur)
    if (up === cur) return process.cwd()
    cur = up
  }
}

function roots() {
  const proj = findProjectRoot(process.cwd())
  const list = [
    { rank: 100, source: 'project-dsh', dir: path.join(proj, '.dsh', 'skills') },
    { rank: 200, source: 'project-agents', dir: path.join(proj, '.agents', 'skills') },
    { rank: 400, source: 'user-dsh', dir: path.join(DSH_HOME, 'skills') },
    { rank: 500, source: 'user-agents', dir: path.join(AGENTS_HOME, 'skills') },
  ]
  for (const extra of (process.env.SKILLCTL_EXTRA || '').split(path.delimiter).filter(Boolean)) {
    list.push({ rank: 300, source: 'custom', dir: path.resolve(extra) })
  }
  return list.filter(r => fs.existsSync(r.dir))
}

/** 解析 YAML frontmatter —— 只认标量，够用 */
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
  return { data, body, hasFm: true, rawFm: raw }
}

const boolish = v => {
  if (v === undefined || v === null) return undefined
  const s = String(v).trim().toLowerCase()
  if (['true', 'yes', 'on', '1'].includes(s)) return true
  if (['false', 'no', 'off', '0'].includes(s)) return false
  return undefined
}

function scan() {
  const found = []
  for (const r of roots()) {
    let entries = []
    try { entries = fs.readdirSync(r.dir, { withFileTypes: true }) } catch { continue }
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
      try { text = fs.readFileSync(file, 'utf8') } catch { continue }
      const { data } = parseFrontmatter(text)
      const name = data.name || (e.isDirectory() ? e.name : e.name.replace(/\.md$/, ''))
      found.push({
        name,
        description: data.description || '',
        modelOff: boolish(data['disable-model-invocation']) === true,
        userOff: boolish(data['user-invocable']) === false,
        source: r.source,
        rank: r.rank,
        file,
      })
    }
  }
  // 同名按 rank 小者优先，与 provider 一致
  const byName = new Map()
  for (const s of found.sort((a, b) => a.rank - b.rank)) {
    if (!byName.has(s.name)) byName.set(s.name, s)
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function setKey(file, key, value) {
  let text = fs.readFileSync(file, 'utf8')
  const fm = parseFrontmatter(text)
  const re = new RegExp(`^${key}\\s*:.*$`, 'im')
  if (value === null) {
    if (!fm.hasFm) return 'no-frontmatter'
    if (re.test(text)) text = text.replace(re, '').replace(/\n{2,}(?=\n---)/, '\n')
  } else if (!fm.hasFm) {
    text = `---\n${key}: ${value}\n---\n\n${text}`
  } else if (re.test(text)) {
    text = text.replace(re, `${key}: ${value}`)
  } else {
    text = text.replace(/^---\s*$/m, `---\n${key}: ${value}`)
  }
  fs.writeFileSync(file, text, 'utf8')
  return 'ok'
}

function need(name) {
  const s = scan().find(x => x.name === name)
  if (!s) {
    console.error(`没找到 skill: ${name}`)
    console.error(`可用: ${scan().map(x => x.name).join(', ') || '(一个也没有)'}`)
    process.exit(1)
  }
  return s
}

const [cmd = 'list', arg] = process.argv.slice(2)

switch (cmd) {
  case 'list': {
    const all = scan()
    if (!all.length) {
      console.log('没有任何 skill。')
      console.log('\n扫过的根（存在的才列）:')
      for (const r of roots()) console.log(`  ${String(r.rank).padStart(3)} ${r.source.padEnd(15)} ${r.dir}`)
      console.log('\n放一个 <名字>/SKILL.md 或 <名字>.md 进去就能被看到。')
      break
    }
    console.log(`共 ${all.length} 个 skill\n`)
    console.log('状态  ' + '名字'.padEnd(24) + '来源'.padEnd(16) + '描述')
    console.log('-'.repeat(96))
    for (const s of all) {
      const st = s.userOff ? '⛔隐藏' : s.modelOff ? '🔒仅手动' : '✅可用 '
      const desc = s.description.length > 42 ? s.description.slice(0, 41) + '…' : s.description
      console.log(`${st}  ${s.name.padEnd(24)}${s.source.padEnd(16)}${desc}`)
    }
    break
  }
  case 'show': {
    const s = need(arg)
    console.log(`名字: ${s.name}`)
    console.log(`文件: ${s.file}`)
    console.log(`来源: ${s.source} (rank ${s.rank})`)
    console.log(`状态: 模型${s.modelOff ? '不可调' : '可调'} / 用户${s.userOff ? '不可见' : '可见'}`)
    console.log(`描述: ${s.description || '(无)'}`)
    console.log('\n--- 正文开头 ---')
    console.log(parseFrontmatter(fs.readFileSync(s.file, 'utf8')).body.slice(0, 600))
    break
  }
  case 'disable': console.log(`${arg}: ${setKey(need(arg).file, 'disable-model-invocation', 'true')}`); break
  case 'enable':  console.log(`${arg}: ${setKey(need(arg).file, 'disable-model-invocation', 'false')}`); break
  case 'hide':    console.log(`${arg}: ${setKey(need(arg).file, 'user-invocable', 'false')}`); break
  case 'unhide':  console.log(`${arg}: ${setKey(need(arg).file, 'user-invocable', 'true')}`); break
  case 'which':   console.log(need(arg).file); break
  default:
    console.error('用法: node skillctl.mjs <list|show|disable|enable|hide|unhide|which> [name]')
    process.exit(1)
}

#!/usr/bin/env node
// 把 profile-template.json 合并进目标 profile 的 package.json
// 用法: node merge-profile.mjs [profileName]   默认 web
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const profile = process.argv[2] || 'web';
const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const target = path.join(dshHome, 'profiles', profile, 'package.json');
const tmplName = process.argv[3] || 'profile-template.json';
const tmplPath = path.join(HERE, tmplName);

if (!fs.existsSync(target)) {
  console.error(`找不到 profile: ${target}`);
  console.error('先跑一次 dsh web 让它初始化，或者用 --from-default-profile 新建一个。');
  process.exit(1);
}

const tmpl = JSON.parse(fs.readFileSync(tmplPath, 'utf8'));
const cur = JSON.parse(fs.readFileSync(target, 'utf8'));
fs.copyFileSync(target, target + '.bak-' + Date.now());

cur.dependencies = cur.dependencies || {};
for (const [k, v] of Object.entries(tmpl.dependencies)) cur.dependencies[k] = v;

cur.dsh = cur.dsh || {};
cur.dsh.profile = cur.dsh.profile || {};
const before = cur.dsh.profile.bundles || [];
const merged = [...before];
for (const b of tmpl.dsh.profile.bundles) if (!merged.includes(b)) merged.push(b);
cur.dsh.profile.bundles = merged;

fs.writeFileSync(target, JSON.stringify(cur, null, 2) + '\n');
console.log(`已更新 ${target}`);
console.log(`  dependencies : ${Object.keys(cur.dependencies).length}`);
console.log(`  bundles      : ${before.length} -> ${merged.length}`);
const added = merged.filter((x) => !before.includes(x));
if (added.length) console.log('  新增加载项   : ' + added.join(', '));
console.log('原文件已备份为 package.json.bak-<时间戳>');

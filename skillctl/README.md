# skillctl — DSH skill 管理器

DSH 本身**没有** skill 管理界面（只有 `/` 菜单触发和 skill 卡片预览）。
开关一个 skill 的唯一原生手段，是手改 `SKILL.md` 的 frontmatter。
这个工具把那件事变成一条命令。

## 用法

```bash
node skillctl.mjs list               # 列出全部 skill 和状态
node skillctl.mjs show <name>        # 看某个 skill 的详情和正文开头
node skillctl.mjs disable <name>     # 模型不可调用，只留 /name 手动触发
node skillctl.mjs enable <name>      # 恢复模型可调用
node skillctl.mjs hide <name>        # 人和模型都看不到
node skillctl.mjs unhide <name>      # 恢复可见
node skillctl.mjs which <name>       # 这个 skill 实际读的是哪个文件
```

零依赖，Node 18+ 直接跑。

## 三种状态

| 状态 | frontmatter | 效果 |
|---|---|---|
| ✅ 可用 | 两个键都缺省 / 都为 true | 模型能自动调，`/` 菜单里也能选 |
| 🔒 仅手动 | `disable-model-invocation: true` | 模型看不到，只有你敲 `/name` 才加载 |
| ⛔ 隐藏 | `user-invocable: false` | `/` 菜单里消失，模型仍可能调到 |

两个键都给 `true` + `false` 组合就是彻底停用。

## 扫描根

和 `@deepseek-ai/dsh-skill-filesystem` 完全一致，按优先级从高到低：

| 优先级 | 来源 | 路径 |
|---|---|---|
| 100 | project-dsh | `<项目根>/.dsh/skills` |
| 200 | project-agents | `<项目根>/.agents/skills` |
| 300 | custom | `$SKILLCTL_EXTRA`（路径分隔符分隔） |
| 400 | user-dsh | `~/.dsh/skills`（跳过 `.system`） |
| 500 | user-agents | `~/.agents/skills` |

项目根 = 最近的含 `.git` 的祖先目录；没有就用 cwd。
同名 skill 按优先级取第一个，和 provider 的解析顺序一致。

## skill 的两种形态

```
<root>/<name>/SKILL.md     ← 目录包，可以带图片、脚本等附属文件
<root>/<name>.md           ← 扁平单文件，够用就够用
```

嵌套的 `**/SKILL.md` **不会**被发现，必须刚好在 root 下一层。

frontmatter 必填 `name` 和 `description`，可选 `whenToUse`、`metadata`、
`disable-model-invocation`、`user-invocable`。

## 装一个现成的 skill

```bash
# 从 skills.sh 上看到的项目，克隆后把技能目录拷进去
git clone --depth 1 https://github.com/mattpocock/skills.git /tmp/msk
mkdir -p ~/.agents/skills
cp -r /tmp/msk/skills/productivity/grilling ~/.agents/skills/
node skillctl.mjs list
```

DSH 会 watch 这些目录，**拷进去就生效，不用重启**。

## 注意

- 工具直接改你磁盘上的 `SKILL.md`，改前想好；没有自动备份
- `disable-model-invocation` 写错值（比如 `ture`）会**整个 skill 被丢弃**，
  不是静默忽略 —— 这也是本工具只写规范 `true` / `false` 的原因
- 项目级 skill 只在那棵项目树里生效，全局要放 `~/.agents/skills`

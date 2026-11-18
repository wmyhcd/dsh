# dsh-skill-manager

在 DSH 的**设置 → 通用**里加一行「Skill 管理」，点开就能看到本机所有 skill，
并直接勾选启用/禁用。

DSH 原生没有 skill 管理界面，唯一的手段是手改 `SKILL.md` 的 frontmatter。
这个插件把那件事搬进了设置面板。

## 它做什么

| 功能 | 说明 |
|---|---|
| 列出所有 skill | 名字、描述、来源目录、实际文件路径 |
| 模型可用 | 对应 `disable-model-invocation`，关掉后模型不会自动调用 |
| 菜单可见 | 对应 `user-invocable`，关掉后 `/` 菜单里消失 |
| 空状态提示 | 没 skill 时列出全部扫描根，告诉你该往哪放 |
| 热生效 | 改的是磁盘文件，DSH 会 watch 目录，**不用重启** |

## 安装

```bash
dsh plugin --profile web add /path/to/dsh-skill-manager-1.0.0.tgz
# 或从仓库
dsh plugin --profile web add file:./dsh-plugins/dsh-skill-manager-1.0.0.tgz
```

然后把 `dsh-skill-manager` 加进 `dsh.profile.bundles`（`dsh plugin add` 只写 dependencies，
**不写 bundles** —— 少了这一步插件不会出现在界面里）。

```json
"dsh": { "profile": { "bundles": [ "...", "dsh-skill-manager" ] } }
```

装完重启 `dsh web`，进 **设置 → 通用**，最后一行就是它。

## 扫描根

与 `@deepseek-ai/dsh-skill-filesystem` 完全一致：

| 优先级 | 来源 | 路径 |
|---|---|---|
| 100 | project-dsh | `<项目根>/.dsh/skills` |
| 200 | project-agents | `<项目根>/.agents/skills` |
| 300 | custom | 插件配置 `customSkillDirs` |
| 400 | user-dsh | `~/.dsh/skills`（跳过 `.system`） |
| 500 | user-agents | `~/.agents/skills` |

项目根 = 最近的含 `.git` 的祖先目录。

## 三种状态

| 模型可用 | 菜单可见 | 效果 |
|---|---|---|
| ✅ | ✅ | 正常，模型能自动调，`/` 能选 |
| ❌ | ✅ | 只留手动 `/name` 触发 |
| ✅ | ❌ | `/` 里消失，模型仍可能调 |
| ❌ | ❌ | 彻底停用 |

## HTTP 接口

插件在 host 上挂了三个只读/受控路由（同源，前端直接 fetch）：

```
GET  /api/skill-manager/list                        列表 + 扫描根状态
GET  /api/skill-manager/preview?name=<name>         某个 skill 的正文
POST /api/skill-manager/toggle                      { name, field: "model"|"user", enabled }
```

## 注意

- 直接改写磁盘上的 `SKILL.md`，**没有自动备份**
- 只动 frontmatter 里的两个布尔键，其余字段与正文原样保留
- 同名 skill 按优先级取第一个，与 provider 的解析顺序一致
- 嵌套的 `**/SKILL.md` 不会被发现，必须在 root 下一层

## License

MIT

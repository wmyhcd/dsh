# dsh-preset-sync

让**已经打开的会话**立刻用上最新的插件配置 —— 侧边栏一个按钮，不用重开会话，不用重启 DSH。

适用于 [DeepSeek Harness](https://github.com/deepseek-ai/dsh) 的 Desktop / Web profile。

## 为什么需要它

DSH 里每个会话都有一个常驻的 Agent，而 Agent 会**记住自己创建时加入的那一份 agent 预设（preset）修订版**。

当你改了某个插件行的设置、或者更新 / 新装了插件，HMR 会让那条插件行重启，预设注册表也会退役旧修订版 —— 但**只要有 Agent 还引用着旧修订版，那棵插件树就不会被释放**。结果是：

- 已经开着的会话继续跑旧工具集和旧提示词；
- 只有新开的会话才用得上新配置；
- 不同会话之间还会各自停在不同修订版上，看起来像"设置互相打架"。

本插件只做一件事：对每个在线会话调用

```js
agentPresets.recompose(agent.ctx, <它自己记录的 preset>)
```

把它重新绑到**当前最新修订版**，同时释放旧树。

## 安装

### 方式一：Plugins 页面（推荐）

**设置 → 插件 → 添加插件**，选择本目录（或克隆后的路径）。

### 方式二：命令行

```bash
dsh plugin --profile <profile> add link:/path/to/dsh-preset-sync
```

### 方式三：作为 profile 依赖

```bash
cd ~/.dsh/profiles/<profile>
pnpm add link:/path/to/dsh-preset-sync
```

装好后在 profile 的 `package.json` 里，把 `dsh-preset-sync` 加进 `dsh.profile.bundles`（Plugins 页面安装时会自动完成）。

## 使用

1. 改完插件设置 / 装好新插件；
2. 侧边栏点 **会话同步**（和 IM 机器人同一排）；
3. 点 **同步所有会话**。

面板会列出每个在线会话用的 preset、当前是空闲还是运行中；完成后给一条汇总，失败的单列原因。

如果侧边栏没立刻出现，**刷新一次页面**即可（仅这一次）。

## 接口

Host 在 `/api/dsh-preset-sync` 注册一个 POST 端点，沿用 DSH 自带的浏览器认证与 Host/Origin 校验，不额外造鉴权。

| 方法 | 作用 |
|---|---|
| `sync.preview` | 列出**所有会话**及其 preset、运行状态、是否有活跃 Agent，不做任何修改 |
| `sync.run` | 对可同步的会话逐个重新绑定；可选 `{ sessionIds: [...] }` 只同步指定会话 |

返回 `{ ok: true, value }` 或 `{ ok: false, error: { code, message, details } }`。

同时注册一个模型可调用的工具 `preset_sync`（`action: 'status' | 'run'`，可选 `sessionIds`），不打开面板也能同步。

## 配置

在 profile 的 `cordis.patch.yml` 里覆盖：

```yaml
- id: preset-sync
  config:
    skipRunning: true
    settleMs: 1200
```

| 字段 | 默认 | 含义 |
|---|---|---|
| `skipRunning` | `true` | 跳过 `running` 状态的会话，避免打断当前回合 |
| `settleMs` | `1200` | 重新绑定前等待配置重组落地的毫秒数 |

## 边界

- **正在跑的会话会被跳过**；等它空闲再点一次，或把 `skipRunning` 设为 `false`。
- 列表用 `agentAvailable` 标注三种状态：**未打开**（没有 Agent，打开即最新，不需要同步）、**运行中**（跳过）、**空闲**（可同步）。
- 同步会**换掉会话正在用的工具集和提示词**；已经写进历史的工具调用不改写，历史本身不动。
- 没有记录 preset 的会话（profile 级装配）会被跳过并标记 `无预设`；子会话（subagent）不会出现在列表里。
- 客户端文案目前是中文硬编码，没有走 Client locale 服务。

## 开发

```bash
# 用 DSH 自带的 Node 跑干跑测试（不需要启动 DSH）
node test/dryrun.mjs
```

`test/dryrun.mjs` 会把真实的 Host 与 Client 代码放进假 ctx 里执行，覆盖路由注册、`sync.preview` / `sync.run` / 指定会话 / 未知方法 / 坏报文，以及插槽注册。

## 结构

```
.
├─ index.js           # Host 半：路由 + recompose 逻辑
├─ client.js          # Client 半：侧边栏入口 + 面板
├─ cordis.patch.yml   # bundle 补丁（注册插件行）
├─ package.json
├─ locale/            # 插件标题与描述
├─ docs/DETAIL.md     # 插件详情页
├─ icon.svg
└─ test/dryrun.mjs
```

## License

MIT
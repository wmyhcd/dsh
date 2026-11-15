# DSH 插件备份（从手机迁移到电脑）

手机 `web` profile 的插件集合，能搬到电脑的都在这。`dsh` 版本 `0.2.0-rc.2`。

## ⚠️ 先看这个：装了插件却看不到，是因为少做了一层

DSH 有**两层**配置，只做第一层等于白装：

| 层 | 在哪 | 作用 |
|---|---|---|
| `dependencies` | `profiles/<name>/package.json` | 把包下载进 `node_modules`。**仅此而已** |
| `dsh.profile.bundles` | 同一个 `package.json` 的 `dsh` 字段 | **决定它加不加载** |

每个插件包里都自带一个 `cordis.patch.yml`，内容是：

```yaml
- insert:
    - id: thinking
      name: dsh-thinking
```

这个文件**只有在插件被列进 `bundles` 时**，才会作为一层 patch 叠加到 profile 树上。没进 bundles → 包躺在 `node_modules` 里，patch 永远不参与组合 → 插件不生效，界面上什么也看不到。

所以 `dsh plugin add xxx` 之后发现"没反应"，先去看 `dsh.profile.bundles` 里有没有它。

## 一键安装

```bash
git clone https://github.com/wmyhcd/dsh.git
cd dsh/dsh-plugins

# Linux / macOS / WSL
bash install.sh

# Windows PowerShell
powershell -ExecutionPolicy Bypass -File install.ps1
```

脚本做三件事：把 `.tgz` 拷进 `profiles/<name>/dsh-plugins/`、合并 `package.json` 的 `dependencies` 和 `bundles`（原文件自动备份）、跑 `dsh plugin install`。

装完重启 `dsh web`。

## 手动安装

```bash
# 1. 拷包（路径必须相对 profile 目录，因为模板里写的是 file:./dsh-plugins/xxx.tgz）
mkdir -p ~/.dsh/profiles/web/dsh-plugins
cp *.tgz ~/.dsh/profiles/web/dsh-plugins/

# 2. 合并 package.json
node merge-profile.mjs web

# 3. 装依赖
dsh plugin --profile web install
```

`merge-profile.mjs` 只做加法和覆盖，不动你已有的其他字段，改之前会备份成 `package.json.bak-<时间戳>`。

## 包清单

| 包 | 版本 | 作用 |
|---|---|---|
| `dsh-purge` | 1.1.71 | 破甲：模型不受系统提示框住，可按模型换不同提示层 |
| `dsh-rules` | 0.1.0 | 规则库：单文件规则，双段注入（最前 + 最后） |
| `dsh-lexicon-shield` | 4.0.0 | 代号护盾：用户消息进会话前按词表把词换成代号，JSON 热加载 |
| `dsh-thinking` | 1.0.1 | 思考链治理：探明可挂钩子、剥离思考链、只读占用统计 |
| `dsh-tool-workspace` | 0.5.15 | 工作区注册管理：list / get / current / create / rename / delete |
| `dsh-link` | 1.2.3 | 把另一台设备的 DSH 变成本机 agent 能指挥的对端（电脑 ↔ 手机互连） |
| `dsh-import-newapi` | 0.1.3 | New API 连接信息一键导成 `llm-pi-ai` provider，密钥写进 `.credentials.yaml` |
| `@xmanrui/dsh-im` | 5.9.1 | 把微信 / 飞书 / 企微 / 钉钉 / QQ / Telegram / WhatsApp / Slack / Discord / Matrix 接入 DSH（11 MB，含各平台适配器） |

## npm 上的（脚本会自动拉）

`profile-template.json` 里已经写好了这些，`dsh plugin install` 时会从 registry 下载：

`dsh-free-search` · `dsh-live2dwaifu` · `dsh-llm-discovery` · `dsh-persona-dafeiyu` · `dsh-public-access` · `dsh-unlag` · `dsh-whale-widget` · `@dfy-plugins/dsh-bundle` · `@dfy-plugins/dsh-image-generation` · `@furongjun1999/dsh-memory` · `@michengai/dsh-archive-manager`

`dsh-persona-dafeiyu` 就是「大肥鱼 / 阿茶 / 听澜」那套人设，装完在设置里选。


## 两个模板：精简版 / 全量版

| 文件 | 依赖 | 加载项 | 说明 |
|---|---|---|---|
| `profile-template.json` | 18 | 20 | **默认**。去掉 4 个手机专用，去掉 2 个要账号凭据的 |
| `profile-template-full.json` | 20 | 22 | 比精简版多 `@tencent-connect/dsh-qqbot` 和 `@xmanrui/dsh-im`（后者已打包为本地 tgz） |

用全量版：

```bash
bash install.sh web profile-template-full.json

powershell -ExecutionPolicy Bypass -File install.ps1 -Template profile-template-full.json
```

`qqbot` 要 QQ 开放平台的应用凭据，`dsh-im` 要 IM 服务端地址，没配好之前它们不会工作，但不影响其他插件。

### 手机那份有 24 个依赖，为什么这里最多 20

差的 4 个是 `dsh-android-env` / `dsh-phone` / `dsh-phone-files` / `dsh-vscreen`——全部依赖安卓的无障碍服务和 Shizuku，电脑上没有对应能力，装上只会让模型误判环境。

另外 `@dfy-plugins` 下有 11 个包，其中只有 `dsh-bundle` 和 `dsh-image-generation` 是直接依赖，剩下 9 个（appearance / codex-bridge / media-blocks / turn-guard / visualize / wallpaper / image-protocol / resource-core / archive-manager）是 `dsh-bundle` 的传递依赖，装它会自动带上，不用单独列。

## 别装这些（手机专用）

| 包 | 为什么 |
|---|---|
| `dsh-android-env` | 描述安卓容器环境、路径地图，电脑上会误导模型 |
| `dsh-phone` | 截图 / 读控件树 / 点击，依赖安卓无障碍 |
| `dsh-phone-files` | 浏览 `/sdcard`，电脑上没有 |
| `dsh-vscreen` | 安卓虚拟屏，需要 Shizuku |

模板里已经把这四个排除了。

手机那份 profile 里还有两个可选的：`@tencent-connect/dsh-qqbot`（QQ 机器人）、`@xmanrui/dsh-im`（IM 客户端）。它们要额外配账号凭据，需要再手动加。

## New API 导入怎么用

装好 `dsh-import-newapi` 后重启，在设置里找到导入入口，粘贴站点地址（`https://站点/v1`）和 `sk-...` 密钥，它会：

1. 自动探测该端点支持的模型列表；
2. 在 patch 里写一个 `llm-pi-ai` provider 条目；
3. 把密钥存进 `$DSH_HOME/.credentials.yaml`，**不落到 patch 文件里**（patch 要进 git，密钥进去就漏了）。

## 排查

| 现象 | 查什么 |
|---|---|
| 装了但界面没有 | `bundles` 里有没有它（本文开头那节） |
| 提示找不到模块 | `dsh plugin --profile web install` 有没有成功跑完 |
| 插件在但功能关闭 | `profiles/<name>/cordis.patch.yml` 里有没有 `disabled: true` |
| id 不匹配 | 插件 `cordis.patch.yml` 里的 `id` 必须和它 `index.js` 里 export 的 `name` 一致，不一致会静默失效 |
| 改了不生效 | 重启 `dsh web`，热重载不一定覆盖 patch 层 |

## 注意

包里的默认配置是从手机这份 profile 导出的，**含我自己调过的东西**（破甲提示词、规则内容、词表）。换机器时按需清空或重调。

`dsh-purge` 的 `client.js` 有 2 MB，是打包产物，属正常。

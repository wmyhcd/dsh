# DSH 插件备份（从手机迁移到电脑）

手机 `web` profile 里装的插件，**能搬到电脑的都在这**。`dsh` 版本 `0.2.0-rc.2`。

## 装法

电脑上装好 dsh 后：

```bash
git clone https://github.com/wmyhcd/dsh.git
cd dsh/dsh-plugins
dsh plugin --profile web add ./dsh-purge-1.1.71.tgz
dsh plugin --profile web add ./dsh-rules-0.1.0.tgz
dsh plugin --profile web add ./dsh-lexicon-shield-4.0.0.tgz
dsh plugin --profile web add ./dsh-thinking-1.0.1.tgz
dsh plugin --profile web add ./dsh-tool-workspace-0.5.15.tgz
dsh plugin --profile web add ./dsh-link-1.2.3.tgz
dsh plugin --profile web add ./dsh-import-newapi-0.1.3.tgz
```

装完 `dsh web` 启动（或重启）才生效。

## 包清单

| 包 | 版本 | 作用 |
|---|---|---|
| `dsh-purge` | 1.1.71 | 破甲：让模型不被系统提示框住，可按模型换不同提示层 |
| `dsh-rules` | 0.1.0 | 自定义规则库：单文件规则、双段注入（最前 + 最后） |
| `dsh-lexicon-shield` | 4.0.0 | 输入侧代号护盾：用户消息进会话前把词表里的词换成代号，JSON 热加载 |
| `dsh-thinking` | 1.0.1 | 思考链治理：探明运行时可挂的钩子、剥离思考链、只读占用统计 |
| `dsh-tool-workspace` | 0.5.15 | 工作区注册管理：list/get/current/create/rename/delete |
| `dsh-link` | 1.2.3 | 把另一台设备的 DSH 变成本机 agent 能指挥的对端（电脑 ↔ 手机互连） |
| `dsh-import-newapi` | 0.1.3 | 把 New API 的连接信息一键导成 `llm-pi-ai` provider，apiKey 直接写进 `.credentials.yaml` |

## 别装这些（手机专用）

| 包 | 为什么 |
|---|---|
| `dsh-android-env` | 描述安卓容器环境、路径地图，电脑上会误导模型 |
| `dsh-phone` | 截图 / 读控件树 / 点击，依赖安卓无障碍 |
| `dsh-phone-files` | 浏览 `/sdcard`，电脑上没有 |
| `dsh-vscreen` | 安卓虚拟屏，需要 Shizuku |

## npm 上有的，不用拷

这些版本号是 semver，电脑上直接 `add` 包名即可拉最新：

```bash
dsh plugin --profile web add dsh-free-search
dsh plugin --profile web add dsh-live2dwaifu
dsh plugin --profile web add dsh-llm-discovery
dsh plugin --profile web add dsh-persona-dafeiyu
dsh plugin --profile web add dsh-public-access
dsh plugin --profile web add dsh-unlag
dsh plugin --profile web add dsh-whale-widget
dsh plugin --profile web add @dfy-plugins/dsh-bundle
dsh plugin --profile web add @dfy-plugins/dsh-image-generation
dsh plugin --profile web add @furongjun1999/dsh-memory
dsh plugin --profile web add @michengai/dsh-archive-manager
```

`dsh-persona-dafeiyu` 就是「大肥鱼 / 阿茶 / 听澜」那一套人设，装完在设置里选。

## New API 导入怎么用

装好 `dsh-import-newapi` 后重启 dsh web，在设置里找到导入入口，粘贴 New API 站点给你的连接串（形如 `https://站点/v1` + `sk-...`），它会：

1. 自动探测该端点支持的模型列表；
2. 在 `cordis.patch.yml` 里写一个 `llm-pi-ai` provider 条目；
3. 把密钥存进 `$DSH_HOME/.credentials.yaml`，**不落到 patch 文件里**。

手机这份 profile 里就是这个插件建的两个 provider（`hachimi-music-icu` / `hachimi-music-icuai`），密钥走的是环境变量 `HACHIMI_MUSIC_ICU_API_KEY`。

## 注意

包里的默认配置是从手机这份 profile 导出的，**含我自己调的东西**（破甲提示词、规则内容、词表）。换机器时按需清空或重调。

`dsh-purge` 的 `client.js` 有 2 MB，是打包产物，属正常。

# QQ 聊天机器人（手机容器版）

跑在这台手机的 Ubuntu 容器里，常驻后台。两条接入通道，共用同一套命令 / 关键词 / AI 逻辑。

| | 官方通道（推荐先试） | 协议通道 |
|---|---|---|
| 原理 | QQ 开放平台官方 WebSocket | 逆向 QQ 协议（icqq） |
| 需要什么 | q.qq.com 建个机器人，拿 AppID + AppSecret | 一个 QQ 号 **+ 外部 sign server** |
| 稳定性 | 官方接口，不会被封 | 协议会变，可能被风控 |
| 群聊限制 | 只能收到 **@机器人** 的消息（平台限制） | 能收到全部消息 |
| 群管理（禁言/踢人） | 不支持 | 支持 |

> **协议通道的硬关卡**：现在 QQ 服务端要求每个包都带签名，没有 sign server 会返回
> `retcode=1 获取二维码失败`。本项目不内置、不推荐任何 sign server —— 得你自己找
> （unidbg-fetch-qsign 之类）。这也是 icqq 官方文档的说法。
> 所以：**想今天就用上，走官方通道。**

---

## 一、快速开始：官方通道

### 1. 拿凭证（手机浏览器就能做）

1. 打开 https://q.qq.com ，用手机 QQ 扫码登录
2. 「应用管理 → 创建应用」→ 选「机器人」
3. 填名字、头像、简介；「消息列表」里勾上**群聊**和**私聊**场景
4. 进「开发设置」，记下 **AppID** 和 **AppSecret**
5. 同一个页面往下，「IP 白名单」留空或填你的出口 IP（沙箱期不填也能连）

### 2. 填配置

编辑同目录的 `config.json`：

```json
"official": {
  "enable": true,
  "appId": "1028xxxxx",
  "appSecret": "你的 secret"
}
```

### 3. 起

```sh
sh start.sh        # 后台启动
sh status.sh       # 看状态
tail -f data/bot.log   # 看日志
```

日志里看到 `官方通道就绪 session=...` 就成了。

### 4. 把它拉进群

在 q.qq.com 的「沙箱配置」里，把你的 QQ 群加进沙箱，然后在群里 @ 它试试：

```
@小助手 /help
```

沙箱期只能在自己配的群里用；要公开给别人用得提交审核。

---

## 二、协议通道（有 sign server 的话）

```json
"account": {
  "enable": true,
  "uin": 你的QQ号,
  "password": "",
  "platform": 1,
  "sign_api_addr": "http://你的sign服务地址:端口"
}
```

然后 `sh start.sh`。

- **首次登录**：几秒后 `data/qrcode.png` 会出现二维码，用 QQ 扫一扫确认
- 如果卡在滑块 / 设备锁：`data/login-hint.txt` 会写清楚要干什么，
  把 ticket 或验证码写进 `data/inbox.txt` 保存，程序会自动读走并继续
- 登录态存在 `data/`，之后重启不用再扫

---

## 三、命令

前缀默认 `/`（`bot.prefix` 可改）。

| 命令 | 说明 | 谁能用 |
|---|---|---|
| `/help` | 命令列表 | 所有人 |
| `/ping` | 存活 + 延迟 | 所有人 |
| `/whoami` | 看自己的身份 | 所有人 |
| `/echo 内容` | 复读 | 所有人 |
| `/weather 杭州` | 查天气（免密钥 open-meteo） | 所有人 |
| `/ai 内容` | 问 AI | 所有人 |
| `/clear` | 清空 AI 上下文 | 所有人 |
| `/status` | 运行状态、内存、消息数 | 主人 |
| `/reload` | 热重载 config.json | 主人 |
| `/ban @人 10` | 禁言 10 分钟，0 解除 | 群管理 |
| `/kick @人 理由` | 移出群 | 群管理 |
| `/muteall on` | 全员禁言开关 | 群管理 |
| `/recall` | 撤回（引用别人的消息发） | 群管理 |
| `/notice on` | 入群欢迎/退群提示 | 群管理 |

「主人」= `config.json` 里 `bot.master` 数组里的 QQ 号。
「群管理」= 主人，或群主/管理员。

> 标了群管理的命令在官方通道下会提示「没有接口」—— 平台不开放这些能力，正常。

## 四、让它会聊天（接 AI）

任何 OpenAI 兼容接口都行：

```json
"ai": {
  "enable": true,
  "baseUrl": "https://api.deepseek.com/v1",
  "apiKey": "sk-xxx",
  "model": "deepseek-chat",
  "systemPrompt": "你是群里的助手小助手，回答简短、口语化，不超过80字。",
  "maxHistory": 6
}
```

开了之后：私聊直接说话、群里 @ 它说话，就会走 AI。
`maxHistory` 是每个会话记住几条，群聊按群共享上下文。

## 五、关键词自动回复

```json
"keywords": [
  { "mode": "equal",    "match": "你好",  "reply": "你好呀" },
  { "mode": "contains", "match": "帮助",  "reply": "发 /help 看看" },
  { "mode": "regex",    "match": "^早安$", "reply": "早安！" }
]
```

`mode` 三种：`equal` 完全相同 / `contains` 包含 / `regex` 正则。
不想在群里被关键词刷屏，把 `bot.keywordNeedAt` 设成 `true`（要 @ 才匹配）。

## 六、行为开关

| 字段 | 作用 |
|---|---|
| `bot.privateAutoReply` | 私聊要不要理 |
| `bot.groupFreeChat` | 群里不 @ 也接 AI 的话（会很吵，默认关） |
| `bot.keywordNeedAt` | 关键词是否必须 @ 才匹配 |
| `bot.replyDelayMs` | 回复前随机延迟 `[最小, 最大]` 毫秒，像人 |
| `bot.rateLimitPerMin` | 每个用户每分钟最多触发几次，防刷 |
| `groups.whitelist` | 只在这些群工作（空 = 所有群） |
| `groups.blacklist` | 这些群不工作 |

## 七、运维

```sh
sh start.sh     # 启动
sh status.sh    # 状态 + 日志尾巴 + 有没有待处理登录
sh stop.sh      # 停止
```

- 日志：`data/bot.log`，按天切分在 `data/logs/`
- 手机重启或 App 重启后，进程会没，重新 `sh start.sh` 即可（登录态在 `data/` 里，不用重填）
- 依赖装在 `/root/qqbot-deps`（`/sdcard` 不支持软链），不用管，启动脚本自动找

## 八、文件结构

```
qqbot/
├── config.json        ← 你只改这个
├── index.js           入口，双通道调度
├── lib/
│   ├── official.js    官方平台 WebSocket 通道
│   ├── protocol.js    icqq 协议通道
│   ├── router.js      消息分发：限速/权限/命令/关键词/AI
│   ├── commands.js    14 个命令
│   ├── ai.js          OpenAI 兼容客户端
│   ├── config.js      配置加载与校验
│   └── log.js         日志
├── tests/selftest.js  用假 client 跑一遍路由（不需要真号）
└── data/              二维码、登录态、日志
```

加功能就在 `lib/commands.js` 里 `def({...})` 一条，参数、权限、实现三行搞定。

## 九、自测

```sh
node tests/selftest.js
```

不需要真 QQ 号，会跑命令分发、权限拒绝、黑名单、限速、兜底等 11 项检查。

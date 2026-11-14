# CF Worker 骨架（免费版）

## 先说清楚：Cloudflare 没有"免费服务器"

CF 免费的不是 VPS —— 没有 root、没有常驻进程、没有公网入站端口。
它免费给的是**边缘运行时**（Workers）和一堆配套服务。能跑 JS/WASM，
不能跑 Node 原生模块、不能 `apt install`、不能 `systemd`。

如果你的目标本来就是"跑个网页 / 提供 API / 做代理中转 / 写个小后端"，
Workers 完全够，而且比 VPS 省事。如果你要的是能 SSH 进去的完整 Linux，
看文末「真·免费 VPS」。

## 免费额度（Free 计划）

| 服务 | 免费额度 |
|---|---|
| Workers | 100,000 请求/天，单次 CPU 10ms |
| Workers 静态资源 | 免费无限 |
| KV | 100k 读/天，1k 写/天，1 GB 存储 |
| D1（SQLite） | 5 GB，5M 行读/天，100k 行写/天 |
| R2（对象存储） | 10 GB 存储，**出流量免费** |
| Queues | 1M 操作/月 |
| Cron Triggers | 免费 |
| Pages | 静态无限，500 次构建/月 |
| Tunnel（cloudflared） | 免费无限 —— 把任意机器暴露到公网 |
| Email Routing | 免费 |

## 这个骨架提供什么

| 路由 | 作用 |
|---|---|
| `GET /` | 状态页，显示出口 IP / 机房 / 国家 |
| `GET /ip` | 同上，JSON 版 |
| `GET /proxy?url=<URL>` | 反向代理，已放开 CORS，可当 API 中转站 |
| `POST /shorten {"url":"..."}` | 生成短链（需绑定 KV） |
| `GET /s/<key>` | 短链跳转 |

`PROXY_ALLOW` 留空 = 任何域名都能反代；填上域名列表 = 只放行这些（推荐）。

## 部署路线 A：网页粘贴（手机最省事，不用装任何东西）

1. 注册 / 登录 <https://dash.cloudflare.com>
2. 左侧 **Compute (Workers)** → **Create** → **Start with Hello World!**
3. 起个名字，Deploy
4. 点 **Edit code**，把 `src/index.js` 全文粘进去覆盖
5. 右上角 **Deploy**
6. 拿到 `https://<名字>.<你的子域>.workers.dev`，直接访问

短链要 KV：**Storage & Databases → KV → Create namespace**，
回到 Worker → **Settings → Bindings → Add → KV namespace**，
Variable name 填 `SHORT`，选刚建的 namespace，重新 Deploy。

## 部署路线 B：命令行（改一次推一次，适合迭代）

需要一个 API Token：**My Profile → API Tokens → Create Token →
Custom token**，权限给：

- `Account` → `Workers Scripts` → **Edit**
- `Account` → `Workers KV Storage` → **Edit**（要用短链才需要）
- `Zone` → `Workers Routes` → **Edit**（要绑自己域名才需要）
- `Account` → `Account Settings` → **Read**（wrangler 校验用）

```bash
cd /sdcard/dsh/cf-worker
export CLOUDFLARE_API_TOKEN=你的token
/root/cf/node_modules/.bin/wrangler deploy
```

token 别写进 wrangler.toml，也别提交到 git —— 放环境变量或 `.dev.vars`（已 gitignore）。

注意没有 `Account ID` 时 wrangler 会问；也可以在 Dashboard 右侧栏抄
Account ID，`export CLOUDFLARE_ACCOUNT_ID=...`。

## 这台手机上的已知限制

- **`wrangler dev` 起不来**：workerd 用 tcmalloc，要求 48 位虚拟地址空间，
  proot 里 1 GB 对齐 mmap 直接失败（`MmapAligned() failed`）。
  所以**本地预览不可用**，只能 `wrangler deploy` 上去实测。
- **`wrangler deploy` 可用**：打包走 esbuild，纯 Go 二进制，正常；
  已实测 `--dry-run --outdir` 产出 5.76 KiB。
- `/sdcard` 是 FAT/exFAT，**不支持 symlink**，`npm i` 装到这里会因为
  `.bin` 软链失败报 EACCES。所以 wrangler 装在 `/root/cf`，源码放 `/sdcard`
  方便你在文件管理器里直接改。

## 真·免费 VPS（如果要完整 Linux）

| 提供方 | 免费内容 | 卡点 |
|---|---|---|
| **Oracle Cloud Always Free** | 4× ARM Ampere 核心 / 24 GB 内存 / 200 GB 盘，永久 | 注册要信用卡验证，ARM 实例经常无库存 |
| Google Cloud | e2-micro 1 台（美国区） | 要绑卡，流量超额计费 |
| AWS | t2/t3.micro 12 个月 | 只有一年 |
| fly.io / Koyeb / Render | 小额度常驻容器 | 会休眠、额度紧 |
| **Cloudflare Tunnel + 自己的设备** | 免费无限 | 得有一台自己的机器（手机也算） |

真要"永久免费还能 SSH"，只有 Oracle 那档能打，其余都是试用或玩具。

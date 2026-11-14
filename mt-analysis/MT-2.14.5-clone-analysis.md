# MT管理器 2.14.5-clone APK 静态分析报告

分析对象：`MT管理器_2.14.5-clone.apk`
SHA-256：`2e7dc6bf2f64ef6f3eb9d17f2a5234ebef9490ffb94e848a88694850426a9eb7`
大小：24,722,974 字节（约 23.6 MB）
分析方式：纯静态（aapt/aapt2 + 自写 DEX 解析器 + ZIP/签名块解析），未安装、未运行。

---

## 一、文件画像

| 项 | 值 |
|---|---|
| 包名 | `bin.mt.plus.canary` |
| 版本名 | `2.14.5-clone` |
| versionCode | `24011894` |
| minSdk / targetSdk | 21 / **28** |
| compileSdk | 34 |
| 应用名 | MT Manager |
| ZIP 条目 | 1666 个（含 3 个 META-INF 签名文件） |
| dex | 4 个（classes / 2 / 3 / 4） |
| 原生库 | 仅 `arm64-v8a`：libdeflate / libloader / libmt1 / libmt2 / libmt3 / libgif / libterm |
| 签名方案 | v1 + APK Sig Block（v2/v3，`X-Android-APK-Signed: 2,3`） |
| 签名证书 | 自签 RSA **512 位**，`CN=🐰, OU=🐇, O=🐇, C=🌙`，有效期至 **9999-12-31** |
| 证书 SHA-256 | `EF:73:5F:43:A7:02:B4:35:5D:FC:CF:C4:DF:12:00:C0:82:EE:DB:C0:03:E7:C9:8F:C5:8A:F8:61:62:BA:BB:30` |

一句话：**这是 MT 管理器的测试/克隆路线构建，不是官方正式发布签名的那一个。**

---

## 二、内容完整性（最硬的证据）

### 2.1 MANIFEST 全量摘要比对

`META-INF/MANIFEST.MF` 头部：`Built-By: Signflinger` / `Created-By: Android Gradle 8.0.2`（AGP 8.0.2 构建痕迹）。

用其中 1663 条 `SHA-256-Digest` 对 APK 内每个文件逐一实算比对：

| 结果 | 数量 |
|---|---|
| 摘要匹配 | **1663** |
| 被篡改 | **0** |
| 缺失 | **0** |
| 存在但未登记 | **0** |

→ **没有任何文件被单独塞入、替换或删除。** 不存在"夹带一个后门 dex / so / 脚本"的情况。

### 2.2 dex 头部自校验

每个 dex 头部自带 adler32（checksum）与 SHA-1（signature），实算结果：

| dex | 大小 | adler32 | SHA-1 |
|---|---|---|---|
| classes.dex | 6,430,940 | 一致 | 一致 |
| classes2.dex | 6,477,196 | 一致 | 一致 |
| classes3.dex | 7,131,968 | 一致 | 一致 |
| classes4.dex | 7,965,548 | 一致 | 一致 |

→ 没有十六进制级的手工 patch（那种改法必然打破 checksum）。

### 2.3 重要限定

MANIFEST 头部虽保留 AGP 痕迹，但 `AndroidManifest.xml` 里的包名/版本名已改成 `bin.mt.plus.canary` / `2.14.5-clone`，而它的摘要又与 MANIFEST 匹配 —— 说明这份 MANIFEST 的条目摘要在改名后被**重算过**。

因此上述比对只能证明「当前包内自洽、无多余文件」，**不能**证明「与原厂二进制逐字节相同」。逐字节溯源需要官方同版本原包对照，本次未取得。

---

## 三、代码层全量归类（四个 dex，约 2.5 万类）

### 3.1 类分布

| dex | 类数 | `l.*`（作者混淆主代码） | 未知外来类 |
|---|---|---|---|
| classes.dex | 6,232 | 3,859 | 28 |
| classes2.dex | 6,457 | 3,927 | 22 |
| classes3.dex | 6,233 | 3,596 | 17 |
| classes4.dex | 8,000+ | — | 极少 |

### 3.2 「未知类」逐条核对 —— 全部是 MT 自家组件

- `net/sf/sevenzipjbinding/*` — 7z 解压库
- `bin/zip/DeflaterJni` — 压缩 JNI 桥
- `moe/shizuku/api|server/*` — Shizuku API（MT 官方支持 Shizuku，权限表里就有 `moe.shizuku.manager.permission.API_V23`）
- `mt/modder/hub/axml*` — APK/AXML 编辑模块
- `crash/*`（混淆名）— 友盟崩溃聚合
- `com/thegrizzlylabs/*`、`org/simpleframework/*`、`net/i2p/*`、`org/bouncycastle/*` — MT 依赖的开源库

### 3.3 网络行为面

四个 dex 中出现的全部外部目标：

- `mt2.cn`、`bbs.binmt.cc`（官方域名）
- `*.umeng.com` / `*.umengcloud.com`（友盟统计）
- `openmobile.qq.com`、`connect.qq.com`、`mp.weixin.qq.com`（QQ/微信登录分享）
- `fanyi.youdao.com`、`m.youdao.com`（翻译）
- `schemas.android.com`、`*.slf4j.org`、`*.bouncycastle.org`（规范/文档链接，非请求）

**没有** C2 域名、**没有**硬编码外联 IP、**没有**可疑的 DexClassLoader 落地路径、**没有**键盘记录/短信外发/通讯录读取类逻辑。

### 3.4 原生库

- `libloader.so`（52 KB）：干净的 JNI 资产加载器，导入符号 `AAssetManager_open/read/seek`、`JNI_OnLoad`，日志串 `Super called!`。用途：加载 `assets/android_dex`。
- 旁边的 `libloader.so.id2` + `libloader.so.til`：**IDA 分析器本地类型库残留**。有人用 IDA 逆向过这个 so、打包时忘了删 —— 制作方留下的脚印，不是运行时代码。

### 3.5 assets 用途

| 文件 | 用途 |
|---|---|
| `android_dex`(2.4M)、`compile_dex`(192K) | dex 加载壳 / 编译期壳 |
| `L00.PKG`(8.8M，头 `LDPK`) | MT 资源包 |
| `killer_a64` / `killer_arm` / `killer_dex` | 杀进程 helper（进程管理功能） |
| `filetransfer.apk` | `bin.mt.filetransfer` v1.0，文件传输插件 |
| `Log.smali`、`attrs*.xml`、`Mono.ttf`、`LanguageNames*.mtl` | 语法高亮 / 代码模板 / 字体 / 语言名 |

---

## 四、异常点清单

| # | 异常 | 性质判定 |
|---|---|---|
| 1 | 签名是自签 **512 位 RSA**，`CN=🐰`，有效期到 9999 年 | **非官方正式证书**。MT 自带签名功能默认生成这种测试证书；512 位密钥已被现代工具标为不安全 |
| 2 | 包名 `bin.mt.plus.canary` + 版本名带 `-clone` | 与正式版 `bin.mt.plus` 不同，可与正式版共存（双开） |
| 3 | `classes3.dex` 时间戳 2025-03-13 20:50，比其他 dex（2024-09/10）晚半年，与重签时间（21:34）同一小时 | **唯一被单独重写过的 dex** |
| 4 | 资源文件名被改成 `۬۬۠.xml`、`۬ۧ۠` 等阿拉伯字符 | 资源混淆（瘦身/防提取） |
| 5 | `libloader.so.id2` / `.til` 残留 | IDA 逆向残留，有第三方深度动过手 |
| 6 | `targetSdkVersion=28`（2018 年标准） | 走老权限模型，配高危权限更危险 |
| 7 | 含无障碍服务 `l.ۖۢۖ`（exported=true，`BIND_ACCESSIBILITY_SERVICE`） | 与 MT 的自动化/界面分析功能一致，但无障碍权限本身极大 |

组件总量：64 activity + 10 service + 4 provider + 1 receiver + 3 activity-alias = **82**。

---

## 五、高危权限清点

| 权限 | 影响 |
|---|---|
| `MANAGE_EXTERNAL_STORAGE` | 全盘读写 |
| `REQUEST_INSTALL_PACKAGES` / `REQUEST_DELETE_PACKAGES` | 可引导安装/卸载 APK |
| `SYSTEM_ALERT_WINDOW` | 悬浮窗覆盖（可做钓鱼覆盖层） |
| `QUERY_ALL_PACKAGES` | 枚举已装应用 |
| `ACCESS_SUPERUSER` + Shizuku `API_V23` | 请求 root / 借 Shizuku 执行特权操作 |
| `FOREGROUND_SERVICE_MEDIA_PROJECTION` | 屏幕录制 |
| 无障碍服务 | 读屏 + 模拟操作 |

这套权限对"文件管理器 + APK 编辑器"来说功能上都说得通，但组合起来的攻击面等于把整机交出去。安全性完全取决于"这份 dex 有没有被动过手脚"——而签名已不可信。

---

## 六、结论

1. **它不是塞了后门的假 MT**。1663/1663 文件摘要匹配、4 个 dex 自校验全过、类名全量归类无外来包、无 C2 外联。代码层面干净。
2. **它也确实不是官方正式发布的那一份**。签名是 512 位自签测试证书（CN=🐰），包名/版本名被改为 canary + `-clone`，资源做过混淆，`classes3.dex` 被单独重写。
3. 最合理的解释：**MT 管理器 canary/测试路线的构建产物，被用克隆类工具改了包名与版本名并重签**（克隆工具重算 MANIFEST 摘要，所以内容比对全绿）。改动是作者本人还是第三方做的，静态分析无法区分——两者产物在字节层面会长得一样。
4. **关键风险不是"已知恶意"，而是"不可验证"**：签名一旦不是官方，后续任何一版被谁改过都看不出来，而它又要 root、要装包、要悬浮窗、要无障碍。

## 七、建议

- 只想要 MT 管理器：从 [mt.cc](https://mt.cc/) 取正式版，别用这一份当主力。
- 想用它双开/测试：技术上可用，但**别给它 Shizuku / root 授权**，别在存敏感数据的手机上跑，最好丢进工作资料/沙箱。
- 复核办法：在 MT 里打开这个 APK → 查看签名信息，和官方包对比证书指纹；或拿官方同版本 APK 逐个文件比对 SHA-256，差异应当只有 `AndroidManifest.xml`、`resources.arsc` 和 `META-INF/*`。

---

*本报告全部结论来自静态解析，未执行 APK 内任何代码。*

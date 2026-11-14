# android-build —— 安卓 APK 构建环境（proot Ubuntu on Android，无 root）

## 目录
```
/root/android-build/
├── env.sh          # source 它，导出全部路径
├── setup.sh        # 一键复原环境（幂等，可反复跑）
├── build-apk.sh    # 通用打包：javac → d8 → aapt2 → zipalign → apksigner
├── sdk/            # android.jar(API34) + r8.jar + Shizuku 四件套
├── keystore/ll.jks # 签名库
├── sample/         # 冒烟测试：纯 UI
├── sample-shizuku/ # 冒烟测试：依赖 Shizuku（验证 aidl 打入 dex）
├── build/          # 每次构建的中间产物（可删）
└── out/            # 产物 APK
```

## 快速开始
```bash
. /root/android-build/env.sh

# 纯 Java + manifest
/root/android-build/build-apk.sh -s 源码目录 -m AndroidManifest.xml -n 工程名 -o out.apk

# 带资源
/root/android-build/build-apk.sh -s src -m AndroidManifest.xml -r res -n 工程名

# 依赖 Shizuku（关键：必须带上 $SHIZUKU_CP 里的 aidl，否则运行时报 NoClassDefFoundError）
/root/android-build/build-apk.sh -s src -m AndroidManifest.xml -e "$SHIZUKU_CP" -n 工程名

# 只读外部 jar/多个 jar
-e "a.jar:b.jar"
```

## 签名
| 项 | 值 |
|---|---|
| keystore | `/root/android-build/keystore/ll.jks`（原件 `/sdcard/dsh/apk_analysis/ll.jks`） |
| alias / 密码 | `ll` / `lcslcs` |
| DN | `CN=linlin, OU=release, O=linlin, L=Local, ST=Local, C=CN` |
| 证书 SHA-256 | `fc8e6e519f1d73ff699abf27679e585f7fbfdb0ab2089d256b19b1f2f625ed73` |
| 默认方案 | v2 + v3（`--v1` 才生成 JAR 签名；apksigner 是否给 v1 取决于 `--min-sdk-version`） |

手机上已装的 `local.delta43`（单单比例助手）与 `com.lcs.hzlock`（单单频率锁）都是这把 key 签的，沿用才能覆盖安装。

## 已知坑（都是踩过的）
1. **Shizuku 必须四件套齐全**：`api + provider + shared + aidl`。缺 `aidl` 会在 `ShizukuProvider.handleSendBinder` 抛
   `NoClassDefFoundError: Lmoe/shizuku/server/IShizukuApplication$Stub`，表现为启动闪退。
2. **别直接改 dex 里的字符串**：DEX 要求 `string_ids` 按字典序排列，改短/改字都会破坏顺序，
   ART 直接拒收：`Out-of-order string_ids` 或 `Non-zero padding ... before section`，进程起不来（ClassNotFoundException）。
   要改必须 baksmali → 编辑 smali → smali 重编（工具会重排 string_ids）。
3. **MIUI 拦全新安装**：`pm install` 报 `INSTALL_FAILED_USER_RESTRICTED: Install canceled by user`；
   但**覆盖安装已存在的包**加 installer 参数能过：
   `pm install -r -i com.miui.packageinstaller /data/local/tmp/x.apk`
4. **system_server 读不到 /sdcard**（SELinux fuse）：`pm install /sdcard/...` 会 `Unable to open file`，
   先 `cp` 到 `/data/local/tmp/` 再装。
5. **/sdcard 不支持原子 rename**：写文件直接用 `cat > file`，别 `mv tmp final`。
6. **没有 systemd/没有 GUI/没有 root**：常驻用 `nohup`，`-0` 只是假身份不提权。

## 与 /root/apkbuild 的关系
`sdk/` 是用 `cp -al` 硬链接过来的，**两者指向同一份 inode**：省 219MB，但**别在原地改 sdk 里的文件**
（要升级就 `rm -rf sdk/xxx` 重新下载，不要 `sed -i` 改）。keystore 是真实拷贝，互不影响。

## 复原
```bash
/root/android-build/setup.sh     # 幂等，缺什么补什么
```
脚本会：检查/切换 apt 镜像 → 补系统包 → 拉 `android.jar` / `r8.jar` / Shizuku 四个 aar → 校验 keystore → 自检。

# 音量档数 40 阶 —— 现状与改造包

机型实测：Xiaomi 22011211C（小米 12），Android 14 / SDK 34。

## 一、现在为什么改不了

```
$ cmd media_session volume --stream 3 --set 40
Error: invalid volume index 40 for stream 3 (should be in [0..15])
```

- 当前 `STREAM_MUSIC`：`Min 0 / Max 15` → **16 档**
- 这台机 **没有 root**（`su` 不存在），只有 Shizuku 的 **adb shell 身份**
- 档数不是音频曲线文件决定的，是 **framework 里 `AudioService` 的音量表**写死的；
  要改必须写 `/system/framework` 或 `/vendor`，shell 身份碰不到

顺带结论：`com.tombayley.volumepanel`、改 `settings`、`cmd media_session` 全都在 0..15 里打转。

## 二、要 40 档，只有 root 一条路

前置：解锁 BL → 刷 Magisk / KernelSU（小米现在解锁要等资格，且清数据）。

拿到 root 后两条路线：

### 路线 A：改音量曲线（先试这个，脚本已备好，失败自动回滚）

```sh
su -c 'sh /sdcard/dsh/volume40/volsteps-detect.sh'   # 先看现状
su -c 'sh /sdcard/dsh/volume40/volsteps-apply.sh 40' # 改成 40 档
```

- 改的是 `/vendor/etc/default_volume_tables.xml` 里
  `DEFAULT_MEDIA_VOLUME_CURVE` + `DEFAULT_DEVICE_CATEGORY_SPEAKER_VOLUME_CURVE`，
  把 4 个点铺成 40 个（`0,-5800` → `39,0`，按原曲线线性插值）
- 脚本会重启 audioserver 并回读 `dumpsys audio`；**Max 没变成 39 就自动还原**
- 成功现象：`dumpsys audio` 里 `STREAM_MUSIC` 的 `Max: 39`，音量条能走到 40 格

### 路线 B：档数写死在 framework（路线 A 报"没变"就走这条）

Android 12+ 的音量表在 `AudioService`（`services.jar`）里，改法二选一：

1. **LSPosed 模块**（推荐，不动分区）：hook `AudioService` 的音量上限字段
   与 `AudioManager.getStreamMaxVolume`，返回 40
2. **改 services.jar**：apktool 反编译 → 改 `MAX_STREAM_VOLUME` 数组
   → 重打包 + core patch 关签名校验（麻烦，且每次系统更新要重做）

社区现成模块可以搜：`Audio-Volume-Steps-Magisk-Module`（GitHub，40/70/100 档）。

## 三、回滚

```sh
su -c 'ls /sdcard/dsh/volume40/backup-*/'
su -c 'cat /sdcard/dsh/volume40/backup-<时间戳>/default_volume_tables.xml > /vendor/etc/default_volume_tables.xml; stop audioserver; start audioserver'
```

原始文件副本也在：`orig_default_volume_tables.xml`。

## 四、文件清单

| 文件 | 作用 |
| --- | --- |
| `volsteps-detect.sh` | 只读诊断：root 状态、档数、曲线位置 |
| `volsteps-apply.sh` | 改档数（自动备份 + 失败自动回滚） |
| `rescale.awk` | 曲线铺点器，单独可复用 |
| `orig_default_volume_tables.xml` | 本机原始曲线副本（回滚用） |

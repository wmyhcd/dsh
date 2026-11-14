#!/usr/bin/env bash
# 复原 Android APK 构建环境（proot Ubuntu on Android，无 root，无 systemd）
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SDK="$HERE/sdk"; KS="$HERE/keystore/ll.jks"
ok(){ printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad(){ printf '  \033[31m✗\033[0m %s\n' "$*"; }
say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }

say "1) apt 源"
if grep -rqs 'mirrors.aliyun.com/ubuntu-ports' /etc/apt/sources.list /etc/apt/sources.list.d/ 2>/dev/null; then
  ok "已是阿里云 ubuntu-ports"
else
  F=$(ls /etc/apt/sources.list.d/*.sources 2>/dev/null | head -1)
  if [ -n "$F" ]; then
    sed -i 's|http://ports.ubuntu.com/ubuntu-ports/|http://mirrors.aliyun.com/ubuntu-ports/|g; s|http://archive.ubuntu.com/ubuntu/|http://mirrors.aliyun.com/ubuntu-ports/|g' "$F"
    ok "已切换到 mirrors.aliyun.com/ubuntu-ports ($F)"
  else
    bad "找不到 sources 文件，请手动设置镜像"
  fi
fi

say "2) 系统包"
NEED="openjdk-21-jdk-headless zip unzip aapt apksigner zipalign python3 curl"
MISS=""
for p in javac zip unzip aapt2 apksigner zipalign python3 curl; do
  command -v "$p" >/dev/null 2>&1 || MISS="$MISS $p"
done
if [ -z "$MISS" ]; then ok "工具链齐全（javac/zip/unzip/aapt2/apksigner/zipalign/curl）"
else
  echo "  缺:$MISS  -> 安装中"
  apt-get update -qq && apt-get install -y --no-install-recommends $NEED && ok "安装完成"
fi

say "3) Android SDK"
mkdir -p "$SDK/plat"
if [ -f "$SDK/plat/android-34/android.jar" ]; then ok "android.jar 已存在"
else
  ( cd "$SDK" && curl -fL --retry 2 -o platform34.zip \
    "https://dl.google.com/android/repository/platform-34-ext7_r03.zip" ) || bad "platform 下载失败（换代理再试）"
  mkdir -p "$SDK/tmp" && unzip -q -o "$SDK/platform34.zip" -d "$SDK/tmp"
  D=$(find "$SDK/tmp" -name android.jar | head -1)
  [ -n "$D" ] && mkdir -p "$SDK/plat/android-34" && cp "$D" "$SDK/plat/android-34/" && ok "android.jar 就位"
fi
if [ -f "$SDK/r8.jar" ]; then ok "r8.jar 已存在"
else
  curl -fL --retry 2 -o "$SDK/r8.jar" \
    "https://dl.google.com/dl/android/maven2/com/android/tools/r8/9.5.28/r8-9.5.28.jar" && ok "r8.jar 就位"
fi

say "4) Shizuku 依赖（api/provider/shared/aidl —— 缺 aidl 必崩）"
# 构件名 : 本地目录名（provider 解到 prov/，与 env.sh 一致）
for pair in api:api provider:prov shared:shared aidl:aidl; do
  art="${pair%%:*}"; dir="${pair##*:}"
  D="$SDK/$dir"
  if [ -f "$D/classes.jar" ]; then ok "$art 已存在"; continue; fi
  mkdir -p "$D"
  curl -fsSL --retry 2 -o "$SDK/$art.aar" \
    "https://repo1.maven.org/maven2/dev/rikka/shizuku/$art/13.1.5/$art-13.1.5.aar" \
    && ( cd "$D" && unzip -o -q "$SDK/$art.aar" classes.jar ) && ok "$art 就位" || bad "$art 下载失败"
done

say "5) 签名库"
if [ -f "$KS" ]; then ok "keystore 已存在: $KS"; else
  mkdir -p "$(dirname "$KS")"
  keytool -genkeypair -keystore "$KS" -alias ll -keyalg RSA -keysize 2048 -validity 10950 \
    -storepass lcslcs -keypass lcslcs \
    -dname "CN=linlin, OU=release, O=linlin, L=Local, ST=Local, C=CN" >/dev/null \
    && chmod 600 "$KS" && ok "已生成 keystore（alias ll / pass lcslcs）"
fi
keytool -list -keystore "$KS" -storepass lcslcs 2>/dev/null | grep -q 'll' && ok "keystore 可读"

say "自检"
for f in "$SDK/plat/android-34/android.jar" "$SDK/r8.jar" "$SDK/api/classes.jar" \
         "$SDK/prov/classes.jar" "$SDK/shared/classes.jar" "$SDK/aidl/classes.jar" "$KS"; do
  [ -f "$f" ] && ok "$(basename $(dirname $f))/$(basename $f)" || bad "缺 $f"
done

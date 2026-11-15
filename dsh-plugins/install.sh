#!/usr/bin/env bash
# DSH 插件一次性安装（Linux / macOS / WSL）
set -e
PROFILE="${1:-web}"
HERE="$(cd "$(dirname "$0")" && pwd)"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PDIR="$DSH_HOME/profiles/$PROFILE"

command -v dsh >/dev/null 2>&1 || { echo "PATH 里没有 dsh，先确认 dsh 装好了"; exit 1; }
[ -f "$PDIR/package.json" ] || { echo "找不到 $PDIR/package.json，先跑一次 dsh $PROFILE"; exit 1; }

echo ">>> profile: $PDIR"
mkdir -p "$PDIR/dsh-plugins"
cp -f "$HERE"/*.tgz "$PDIR/dsh-plugins/"
echo ">>> 插件包已拷入 $PDIR/dsh-plugins/"

echo ">>> 合并 package.json（dependencies + bundles）"
node "$HERE/merge-profile.mjs" "$PROFILE"

echo ">>> 安装依赖"
dsh plugin --profile "$PROFILE" install

echo
echo "完成。重启 dsh $PROFILE 生效。"
echo "如果界面里仍缺插件，检查 $PDIR/cordis.patch.yml 里有没有被 disabled: true 的条目。"

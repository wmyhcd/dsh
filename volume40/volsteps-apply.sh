#!/system/bin/sh
# volsteps-apply.sh —— 把媒体音量改成 N 档（默认 40 档 = index 0..39）
#
# 用法:
#   su -c 'sh /sdcard/dsh/volume40/volsteps-apply.sh'       # 40 档
#   su -c 'sh /sdcard/dsh/volume40/volsteps-apply.sh 25'    # 25 档
#
# 原理: 重写 /vendor/etc/default_volume_tables.xml 里媒体用的两条曲线，
#       把曲线点铺成 N 个（0..N-1，按原曲线的衰减线性插值）。
# 安全: 先备份；重启 audioserver 后回读 dumpsys，Max 不等于 N-1 就自动还原。

set -u
NSTEPS=${1:-40}
IDX_MAX=$((NSTEPS - 1))
CURVE=/vendor/etc/default_volume_tables.xml
BASE=/sdcard/dsh/volume40
AWKF="$BASE/rescale.awk"
BK="$BASE/backup-$(date +%Y%m%d-%H%M%S)"

rollback() {
    if [ -f "$BK/default_volume_tables.xml" ]; then
        cat "$BK/default_volume_tables.xml" > "$CURVE"
        echo "→ 已还原 $CURVE"
        stop audioserver 2>/dev/null; start audioserver 2>/dev/null
    fi
}
die() { echo "✗ $*"; rollback; exit 1; }

[ "$(id -u)" = "0" ] || die "需要 root：su -c 'sh $0 $NSTEPS'"
[ -f "$CURVE" ]      || die "找不到 $CURVE（曲线可能在别处，先跑 volsteps-detect.sh）"
[ -f "$AWKF" ]       || die "找不到 $AWKF"
[ "$NSTEPS" -ge 5 ] && [ "$NSTEPS" -le 100 ] || die "档数给 5..100"

mkdir -p "$BK" || die "备份目录建不出来: $BK"
cp -a "$CURVE" "$BK/" || die "备份失败"
echo "✓ 原文件已备份 -> $BK/default_volume_tables.xml"

mount -o rw,remount /vendor 2>/dev/null \
  || mount -o rw,remount / 2>/dev/null \
  || echo "! remount /vendor 没成功，继续试（Magisk 环境通常可直接写）"

awk -v n="$NSTEPS" -f "$AWKF" "$CURVE" > "$BK/new.xml" || die "生成新曲线失败"
NEWPTS=$(grep -c '<point>' "$BK/new.xml")
[ "$NEWPTS" -gt 0 ] || die "新文件里没有 point，中止"
echo "✓ 新曲线: $BK/new.xml （$NEWPTS 个 point，媒体曲线共 $((NSTEPS * 2)) 个）"

cat "$BK/new.xml" > "$CURVE" || die "写入 $CURVE 失败"

stop audioserver 2>/dev/null
start audioserver 2>/dev/null
sleep 3

MAX=$(dumpsys audio | awk '/^- STREAM_MUSIC:/{f=1} f&&/Max:/{print $2; exit}')
echo "→ 回读 dumpsys: STREAM_MUSIC Max index = ${MAX:-读不到}（目标 $IDX_MAX）"

if [ "${MAX:-}" = "$IDX_MAX" ]; then
    echo "✓ 成功：媒体音量现在是 $NSTEPS 档"
    echo "  试一试: cmd media_session volume --stream 3 --set $IDX_MAX"
    echo "  回滚:   su -c 'cat $BK/default_volume_tables.xml > $CURVE; stop audioserver; start audioserver'"
else
    echo "✗ 曲线改了但档数没变 —— 这台 ROM 的档数写死在 framework（Android 12+ 常见），"
    echo "  改 vendor 曲线没用，得走 framework 层（services.jar 补丁 / LSPosed 模块）。"
    rollback
    exit 2
fi

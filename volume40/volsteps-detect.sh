#!/system/bin/sh
# volsteps-detect.sh —— 只读诊断：这台机的音量档数是怎么来的
# 用法: su -c 'sh /sdcard/dsh/volume40/volsteps-detect.sh'
# 不改任何文件。

echo "=== 1. 身份 ==="
id
if [ "$(id -u)" = "0" ]; then echo "root: 有"; else echo "root: 没有（下面有些读不到）"; fi
command -v magisk >/dev/null 2>&1 && echo "Magisk: $(magisk -V)" || echo "Magisk: 无"
command -v ksud    >/dev/null 2>&1 && echo "KernelSU: 有"

echo
echo "=== 2. 机型 ==="
echo "model   : $(getprop ro.product.model)"
echo "android : $(getprop ro.build.version.release)  (sdk $(getprop ro.build.version.sdk))"
echo "build   : $(getprop ro.build.display.id)"

echo
echo "=== 3. 当前档数 (STREAM_MUSIC) ==="
dumpsys audio | sed -n '/^- STREAM_MUSIC:/,/Volume Group/p'

echo
echo "=== 4. 音量曲线文件 ==="
for f in /vendor/etc/audio_policy_volumes.xml /vendor/etc/default_volume_tables.xml; do
    [ -f "$f" ] && echo "有  $f  ($(wc -c <"$f") 字节)" || echo "无  $f"
done

echo
echo "=== 5. 媒体曲线的最大索引 ==="
grep -oE '<point>[0-9]+' /vendor/etc/default_volume_tables.xml 2>/dev/null \
  | grep -oE '[0-9]+' | sort -n | tail -1 | sed 's/^/max point index = /'

echo
echo "=== 6. 结论速查 ==="
MAX=$(dumpsys audio | awk '/^- STREAM_MUSIC:/{f=1} f&&/Max:/{print $2; exit}')
echo "当前 Max index = ${MAX:-?}（即 $(( ${MAX:-0} + 1 )) 档）"
echo "改档数要写 /vendor 或 /system/framework —— 只有 root 能做。"

#!/bin/bash
# ============================================================
# 视频守护：自动修复"系统解码器会切斜"的新视频
#
# 原理：手机 HEVC 解码器对特定分辨率(如 608→592)的裁剪窗口
#       处理有 bug，导致画面逐行错位。此脚本发现这类新视频后
#       自动转成"编码宽=显示宽"的 H.264，从根上消除触发条件。
#
# 安全：原片只移动到 backup 目录（带 .nomedia），绝不删除。
# ============================================================

BACKUP=/sdcard/dsh/backup
STATE=/sdcard/dsh/.video_guard_seen
LOG=/sdcard/dsh/video_guard.log
TMP=/sdcard/dsh/tmp
INTERVAL=45
DIRS="/sdcard/Movies/QQ /sdcard/DCIM/Camera /sdcard/Download /sdcard/Movies /sdcard/Tencent /sdcard/Pictures /sdcard/Android/data/com.tencent.mobileqq/Tencent/QQfile_recv"

mkdir -p "$BACKUP" "$TMP"
touch "$BACKUP/.nomedia"
log(){ echo "[$(date '+%F %T')] $*" >> "$LOG"; }

fix_one(){
  local f="$1"
  local key
  key="$f|$(stat -c '%s-%Y' "$f" 2>/dev/null)"
  grep -qxF "$key" "$STATE" 2>/dev/null && return 0

  # 必须存在且可读
  [ -f "$f" ] || return 0

  # 文件正在写入则跳过（两次大小一致才算稳定）
  local s1 s2
  s1=$(stat -c%s "$f" 2>/dev/null)
  sleep 2
  s2=$(stat -c%s "$f" 2>/dev/null)
  [ -n "$s1" ] && [ "$s1" = "$s2" ] || return 0
  [ "$s1" -lt 100000 ] && { echo "$key" >> "$STATE"; return 0; }

  local info codec w cw h ch
  info=$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=codec_name,width,coded_width,height,coded_height \
    -of default=nw=1 "$f" 2>/dev/null)
  codec=$(echo "$info"|sed -n 's/^codec_name=//p')
  w=$(echo "$info"|sed -n 's/^width=//p');      cw=$(echo "$info"|sed -n 's/^coded_width=//p')
  h=$(echo "$info"|sed -n 's/^height=//p');     ch=$(echo "$info"|sed -n 's/^coded_height=//p')
  [ -z "$codec" ] && return 0

  # 无裁剪窗口 → 安全，记账走人
  if [ "$w" = "$cw" ] && [ "$h" = "$ch" ]; then
    echo "$key" >> "$STATE"; return 0
  fi

  # 有裁剪：只对 HEVC 下手（H.264 的裁剪兼容性没问题，不去动它）
  if [ "$codec" != "hevc" ]; then
    log "跳过(非HEVC): $f  ${cw}x${ch}->${w}x${h}"
    echo "$key" >> "$STATE"; return 0
  fi

  log "命中: $f  ${codec} ${cw}x${ch} -> ${w}x${h}  开始修复"
  local base out
  base=$(basename "$f")
  out="$TMP/guard_$$.mp4"
  rm -f "$out"

  if ffmpeg -hide_banner -v error -y -i "$f" \
      -vf "fps=30,format=yuv420p" \
      -c:v libx264 -preset veryfast -crf 20 -profile:v high -level 4.0 \
      -c:a aac -b:a 128k \
      -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
      -movflags +faststart "$out" >>"$LOG" 2>&1; then

    local ow ocw
    ow=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$out" 2>/dev/null)
    ocw=$(ffprobe -v error -select_streams v:0 -show_entries stream=coded_width -of csv=p=0 "$out" 2>/dev/null)

    if [ -n "$ow" ] && [ "$ow" = "$ocw" ]; then
      local bak="$BACKUP/${base%.*}_$(date +%Y%m%d%H%M%S).orig.mp4"
      if mv "$f" "$bak" && cp "$out" "$f"; then
        log "修复完成: $f  (原片已移至 $bak)"
        echo "$key" >> "$STATE"
      else
        log "替换失败，尝试回滚: $f"
        [ -f "$bak" ] && [ ! -f "$f" ] && mv "$bak" "$f"
      fi
    else
      log "校验未通过(仍有裁剪 $ocw/$ow)，保留原样: $f"
      echo "$key" >> "$STATE"
    fi
  else
    log "转码失败: $f"
  fi
  rm -f "$out"
}

# 首次启动：把现有文件全部登记，避免一上来就批量重转
if [ ! -f "$STATE" ]; then
  log "首次运行，登记现有文件"
  for d in $DIRS; do
    [ -d "$d" ] || continue
    find "$d" -maxdepth 1 -type f \( -iname "*.mp4" -o -iname "*.mov" \) 2>/dev/null | while read -r f; do
      echo "$f|$(stat -c '%s-%Y' "$f" 2>/dev/null)" >> "$STATE"
    done
  done
fi

log "守护启动 (间隔 ${INTERVAL}s，监控: $DIRS)"
while true; do
  for d in $DIRS; do
    [ -d "$d" ] || continue
    find "$d" -maxdepth 1 -type f \( -iname "*.mp4" -o -iname "*.mov" \) -newermt "-10 days" 2>/dev/null | while read -r f; do
      fix_one "$f"
    done
  done
  sleep "$INTERVAL"
done

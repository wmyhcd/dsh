#!/system/bin/sh
# 屏幕超时开关：restore 恢复原值(10分钟) / never 永不息屏
case "$1" in
  never)   settings put system screen_off_timeout 2147483647 ;;
  restore) settings put system screen_off_timeout "$(cat /sdcard/dsh/.screen-timeout-orig)" ;;
  *)       settings get system screen_off_timeout ;;
esac
settings get system screen_off_timeout

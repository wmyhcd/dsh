#!/bin/sh
# 手机 DSH 局域网访问（反向代理到宿主实例 3080）
[ -f /tmp/dsh-proxy.pid ] && kill "$(cat /tmp/dsh-proxy.pid)" 2>/dev/null
sleep 1
setsid nohup python3 /tmp/dsh-proxy.py > /tmp/dsh-proxy.log 2>&1 < /dev/null &
sleep 2
echo "代理已启动 PID=$(cat /tmp/dsh-proxy.pid)"
echo "访问: http://$(ip -4 addr show wlan0 2>/dev/null | grep -oP 'inet \K[\d.]+'):3081"

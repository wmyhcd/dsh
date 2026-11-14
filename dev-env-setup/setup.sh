#!/usr/bin/env bash
# 编程环境一键复原（proot Ubuntu on Android / aarch64 / 无 root / 无 systemd）
# 套餐：C/C++ + Clang + 终端增强 + sqlite/redis + Go + PHP + Ruby（不含 Rust、Gradle）
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ok(){   printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad(){  printf '  \033[31m✗\033[0m %s\n' "$*"; }
skip(){ printf '  \033[36m·\033[0m %s\n' "$*"; }
say(){  printf '\n\033[1m%s\033[0m\n' "$*"; }
need(){ command -v "$1" >/dev/null 2>&1; }
PM=""
for p in build-essential make cmake pkg-config sqlite3 redis-server tmux neovim fzf bat htop tree \
         clang lld php-cli composer ruby ruby-dev; do PM="$PM $p"; done

say "1) apt 镜像"
if grep -rqs 'mirrors.aliyun.com/ubuntu-ports' /etc/apt/sources.list /etc/apt/sources.list.d/ 2>/dev/null; then
  ok "已是 mirrors.aliyun.com/ubuntu-ports"
else
  F=$(ls /etc/apt/sources.list.d/*.sources 2>/dev/null | head -1)
  [ -n "$F" ] && sed -i 's|http://ports.ubuntu.com/ubuntu-ports/|http://mirrors.aliyun.com/ubuntu-ports/|g; s|http://archive.ubuntu.com/ubuntu/|http://mirrors.aliyun.com/ubuntu-ports/|g' "$F" \
    && ok "已切到阿里云镜像" || bad "找不到 sources 文件"
fi

say "2) 系统包（C/C++ · Clang · 终端 · 数据库 · PHP · Ruby）"
MISS=""
for t in gcc g++ make cmake pkg-config sqlite3 redis-server tmux nvim fzf bat htop tree clang lld php composer ruby gem; do
  need "$t" || { [ "$t" = bat ] && need batcat && continue; MISS="$MISS $t"; }
done
if [ -z "$MISS" ]; then
  skip "全部已存在，跳过 apt"
else
  echo "  缺:$MISS"
  apt-get update -qq || bad "apt-get update 失败"
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $PM \
    && ok "apt 安装完成" || bad "apt 安装有失败项，见上方输出"
fi
if ! command -v bat >/dev/null 2>&1 && command -v batcat >/dev/null 2>&1; then
  ln -sf "$(command -v batcat)" /usr/local/bin/bat && ok "bat -> batcat 软链已建"
fi

say "3) Go（官方 aarch64 版，不用 apt 的旧版）"
if [ -x /opt/go/bin/go ]; then
  ok "已存在: $(/opt/go/bin/go version 2>/dev/null | awk '{print $3}')"
else
  VER=""
  VER=$(curl -fsSL --max-time 40 https://go.dev/dl/?mode=json 2>/dev/null \
        | python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["version"])' 2>/dev/null || true)
  [ -z "$VER" ] && VER="go1.23.4" && echo "  (取版本失败，回退 $VER)"
  TARBALL="${VER}.linux-arm64.tar.gz"
  GOT=""
  for base in "https://go.dev/dl" "https://golang.google.cn/dl" "https://mirrors.aliyun.com/golang"; do
    echo "  下载 $base/$TARBALL"
    if curl -fL --retry 2 --max-time 600 -o /tmp/$TARBALL "$base/$TARBALL" 2>/dev/null; then GOT=1; break; fi
  done
  if [ -n "$GOT" ]; then
    rm -rf /opt/go && mkdir -p /opt && tar -xzf /tmp/$TARBALL -C /opt && rm -f /tmp/$TARBALL
    ok "Go 就位: $(/opt/go/bin/go version | awk '{print $3}')"
  else
    bad "Go 下载失败（网络/代理），稍后重跑本脚本即可"
  fi
fi

say "4) PATH 落地"
if ! grep -qs 'dev-env/env.sh' /root/.bashrc; then
  printf '\n# dev-env\n[ -f /root/dev-env/env.sh ] && . /root/dev-env/env.sh\n' >> /root/.bashrc
  ok "已写入 /root/.bashrc"
else
  skip ".bashrc 已包含"
fi

say "5) 自检"
chk(){ local n="$1" b="${2:-}"; [ -z "$b" ] && b="$n"
  if command -v "$n" >/dev/null 2>&1 || [ -x "$b" ]; then
    local v
    case "$n" in
      go)  v=$("$b" version 2>/dev/null);;
      sqlite3) v=$("$b" --version 2>/dev/null);;
      redis-server) v=$("$b" --version 2>/dev/null);;
      tmux) v=$("$b" -V 2>/dev/null);;
      *)   v=$("$b" --version 2>/dev/null | head -1);;
    esac
    printf '  \033[32m✓\033[0m %-10s %s\n' "$n" "$(printf '%s' "$v" | head -1 | cut -c1-60)"
  else printf '  \033[31m✗\033[0m %-10s 缺失\n' "$n"; fi; }
chk gcc; chk g++ ; chk make ""; chk cmake; chk clang; chk lld
chk go /opt/go/bin/go; chk php; chk composer; chk ruby; chk gem
chk sqlite3; chk redis-server; chk tmux; chk nvim; chk fzf; chk bat; chk htop; chk tree
echo
df -h / | tail -1

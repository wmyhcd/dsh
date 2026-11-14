# 用法： . /root/dev-env/env.sh
export DEV_HOME="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
export GO_ROOT="/opt/go"
export GOPATH="${GOPATH:-/root/go}"
export GOBIN="$GOPATH/bin"
export PATH="$GO_ROOT/bin:$GOBIN:$DEV_HOME/bin:$PATH"
mkdir -p "$GOBIN" "$DEV_HOME/bin"

#!/bin/bash
# Oracle Cloud 抢 ARM 免费实例 —— 在 Cloud Shell 里跑
# 用法: bash grab.sh
set -u

SHAPE="VM.Standard.A1.Flex"
OCPUS=2
MEM=12
NAME="qqbot"
KEYFILE="$HOME/.ssh/oci_key"

echo "======================================"
echo " Oracle 免费 ARM 实例抢机脚本"
echo "======================================"

# 1) SSH 密钥
if [ ! -f "$KEYFILE" ]; then
  echo "[1/4] 生成 SSH 密钥..."
  mkdir -p "$HOME/.ssh"
  ssh-keygen -t rsa -b 4096 -N "" -f "$KEYFILE" -q
fi
PUBKEY=$(cat "$KEYFILE.pub")
echo "[1/4] SSH 公钥已就绪"

# 2) 找 compartment（用 tenancy 根）
TENANCY=$(grep -m1 '^tenancy' ~/.oci/config | cut -d= -f2 | tr -d ' ')
echo "[2/4] Tenancy: $TENANCY"

# 3) 找 AD / 镜像 / 子网
echo "[3/4] 探测可用域与资源..."

ADS=$(oci iam availability-domain list --query 'data[].name' --raw-output | tr -d '[]"' | tr ',' '\n' | tr -d ' ')

AD=$(echo "$ADS" | head -1)
echo "  可用域: $(echo $ADS | tr '\n' ' ')"

IMG=$(oci compute image list \
  --compartment-id "$TENANCY" \
  --operating-system "Canonical Ubuntu" \
  --operating-system-version "24.04" \
  --shape "$SHAPE" \
  --sort-by TIMECREATED --sort-order DESC \
  --query 'data[0].id' --raw-output 2>/dev/null)

if [ -z "$IMG" ] || [ "$IMG" = "null" ]; then
  IMG=$(oci compute image list \
    --compartment-id "$TENANCY" \
    --operating-system "Canonical Ubuntu" \
    --shape "$SHAPE" \
    --sort-by TIMECREATED --sort-order DESC \
    --query 'data[0].id' --raw-output)
fi
echo "  镜像: ${IMG:0:60}..."

# 找已有 VCN 里的子网；没有就建一个
SUBNET=$(oci network subnet list --compartment-id "$TENANCY" --query 'data[0].id' --raw-output 2>/dev/null)
if [ -z "$SUBNET" ] || [ "$SUBNET" = "null" ]; then
  echo "  没有子网，创建 VCN..."
  VCN=$(oci network vcn create --compartment-id "$TENANCY" --cidr-block "10.0.0.0/16" \
        --display-name "qqbot-vcn" --query 'data.id' --raw-output)
  sleep 5
  IGW=$(oci network internet-gateway create --compartment-id "$TENANCY" --vcn-id "$VCN" \
        --is-enabled true --display-name "qqbot-igw" --query 'data.id' --raw-output)
  sleep 5
  RT=$(oci network route-table list --compartment-id "$TENANCY" --vcn-id "$VCN" \
       --query 'data[0].id' --raw-output)
  oci network route-table update --rt-id "$RT" --route-rules \
    "[{\"destination\":\"0.0.0.0/0\",\"networkEntityId\":\"$IGW\"}]" --force >/dev/null
  SL=$(oci network security-list list --compartment-id "$TENANCY" --vcn-id "$VCN" \
       --query 'data[0].id' --raw-output)
  oci network security-list update --security-list-id "$SL" --egress-security-rules \
    '[{"destination":"0.0.0.0/0","protocol":"all","isStateless":false}]' \
    --ingress-security-rules \
    '[{"source":"0.0.0.0/0","protocol":"6","isStateless":false,"tcpOptions":{"destinationPortRange":{"min":22,"max":22}}}]' --force >/dev/null
  SUBNET=$(oci network subnet create --compartment-id "$TENANCY" --vcn-id "$VCN" \
           --cidr-block "10.0.1.0/24" --display-name "qqbot-subnet" \
           --route-table-id "$RT" --security-list-ids "[\"$SL\"]" \
           --query 'data.id' --raw-output)
  sleep 10
fi
echo "  子网: ${SUBNET:0:60}..."

# 4) 主循环
echo "[4/4] 开始抢机（每 40 秒一轮，抢到自动停）"
echo "       按 Ctrl+C 可停止"
echo

N=0
while true; do
  N=$((N+1))
  for AD in $ADS; do
    TS=$(date '+%H:%M:%S')
    OUT=$(oci compute instance launch \
      --compartment-id "$TENANCY" \
      --availability-domain "$AD" \
      --shape "$SHAPE" \
      --shape-config "{\"ocpus\":$OCPUS,\"memoryInGBs\":$MEM}" \
      --image-id "$IMG" \
      --subnet-id "$SUBNET" \
      --display-name "$NAME" \
      --assign-public-ip true \
      --metadata "{\"ssh_authorized_keys\":\"$PUBKEY\"}" 2>&1)

    if echo "$OUT" | grep -qi "Out of host capacity\|capacity"; then
      echo "[$TS] 第 $N 轮 $AD → 没库存"
    elif echo "$OUT" | grep -qi '"lifecycle-state"'; then
      echo "[$TS] 第 $N 轮 $AD → ★★★ 抢到了！"
      echo "$OUT" > /tmp/instance.json
      IP=$(oci compute instance list-vnics --instance-id "$(echo "$OUT" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')" --query 'data[0]."public-ip"' --raw-output 2>/dev/null)
      echo "----------------------------------------"
      echo " 公网 IP : $IP"
      echo " SSH 私钥: $KEYFILE"
      echo " SSH 命令: ssh -i $KEYFILE ubuntu@$IP"
      echo "----------------------------------------"
      echo "私钥内容（复制保存好）："
      cat "$KEYFILE"
      exit 0
    else
      echo "[$TS] 第 $N 轮 $AD → 其他错误："
      echo "$OUT" | head -3
    fi
  done
  sleep 40
done

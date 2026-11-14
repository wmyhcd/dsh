#!/bin/bash
# Oracle 免费 ARM 抢机（Cloud Shell 版）
SHAPE="VM.Standard.A1.Flex"; OCPUS=2; MEM=12; NAME="qqbot"
KEY="$HOME/.ssh/oci_key"
[ -f "$KEY" ] || ssh-keygen -t rsa -b 4096 -N "" -f "$KEY" -q
PUB=$(cat "$KEY.pub")
T=$(grep -m1 '^tenancy' ~/.oci/config | cut -d= -f2 | tr -d ' ')
ADS=$(oci iam availability-domain list --query 'data[].name' --raw-output | tr -d '[]"' | tr ',' '\n' | tr -d ' ')
IMG=$(oci compute image list --compartment-id "$T" --operating-system "Canonical Ubuntu" --operating-system-version "24.04" --shape "$SHAPE" --sort-by TIMECREATED --sort-order DESC --query 'data[0].id' --raw-output 2>/dev/null)
[ "$IMG" = "null" -o -z "$IMG" ] && IMG=$(oci compute image list --compartment-id "$T" --operating-system "Canonical Ubuntu" --shape "$SHAPE" --sort-by TIMECREATED --sort-order DESC --query 'data[0].id' --raw-output)

SUB=$(oci network subnet list --compartment-id "$T" --query 'data[0].id' --raw-output 2>/dev/null)
if [ "$SUB" = "null" -o -z "$SUB" ]; then
  echo ">> 建网络..."
  V=$(oci network vcn create --compartment-id "$T" --cidr-block 10.0.0.0/16 --display-name qqbot-vcn --query data.id --raw-output); sleep 8
  G=$(oci network internet-gateway create --compartment-id "$T" --vcn-id "$V" --is-enabled true --display-name qqbot-igw --query data.id --raw-output); sleep 8
  R=$(oci network route-table list --compartment-id "$T" --vcn-id "$V" --query 'data[0].id' --raw-output)
  oci network route-table update --rt-id "$R" --route-rules "[{\"destination\":\"0.0.0.0/0\",\"networkEntityId\":\"$G\"}]" --force >/dev/null
  S=$(oci network security-list list --compartment-id "$T" --vcn-id "$V" --query 'data[0].id' --raw-output)
  oci network security-list update --security-list-id "$S" \
    --egress-security-rules '[{"destination":"0.0.0.0/0","protocol":"all","isStateless":false}]' \
    --ingress-security-rules '[{"source":"0.0.0.0/0","protocol":"6","isStateless":false,"tcpOptions":{"destinationPortRange":{"min":22,"max":22}}}]' --force >/dev/null
  SUB=$(oci network subnet create --compartment-id "$T" --vcn-id "$V" --cidr-block 10.0.1.0/24 --display-name qqbot-subnet --route-table-id "$R" --security-list-ids "[\"$S\"]" --query data.id --raw-output); sleep 12
fi

echo ">> 开始抢机（Ctrl+C 停止）"
N=0
while true; do
  N=$((N+1))
  for AD in $ADS; do
    O=$(oci compute instance launch --compartment-id "$T" --availability-domain "$AD" --shape "$SHAPE" \
      --shape-config "{\"ocpus\":$OCPUS,\"memoryInGBs\":$MEM}" --image-id "$IMG" --subnet-id "$SUB" \
      --display-name "$NAME" --assign-public-ip true --metadata "{\"ssh_authorized_keys\":\"$PUB\"}" 2>&1)
    if echo "$O" | grep -qi '"lifecycle-state"'; then
      ID=$(echo "$O" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
      IP=$(oci compute instance list-vnics --instance-id "$ID" --query 'data[0]."public-ip"' --raw-output)
      echo; echo "================ 抢到了 ================"
      echo " IP   : $IP"
      echo " 私钥 : $KEY"
      echo " 登录 : ssh -i $KEY ubuntu@$IP"
      echo "========================================"
      echo "私钥内容："; cat "$KEY"
      exit 0
    elif echo "$O" | grep -qi capacity; then
      echo "[$(date +%H:%M:%S)] 第$N轮 $AD 无库存"
    else
      echo "[$(date +%H:%M:%S)] 第$N轮 $AD $(echo "$O" | head -2 | tr '\n' ' ')"
    fi
  done
  sleep 40
done

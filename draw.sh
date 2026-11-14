#!/bin/bash
# 用法: ./draw.sh "提示词" 输出.png [尺寸]
KEY=$(sed -n 's/^ *SZ_API_KEY: *//p' /root/.dsh/.credentials.yaml | tr -d '"'"'"' \r')
P="$1"; OUT="${2:-/sdcard/dsh/out.png}"; SZ="${3:-1024x1024}"
node -e 'process.stdout.write(JSON.stringify({model:"gpt-image-2",prompt:process.argv[1],size:process.argv[2],n:1}))' "$P" "$SZ" > /tmp/draw.json
curl -s -m 240 https://napi.noi-zl.top/v1/images/generations \
 -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' --data-binary @/tmp/draw.json -o /tmp/draw.out
node -e '
const fs=require("fs"),j=JSON.parse(fs.readFileSync("/tmp/draw.out","utf8"));
if(!j.data){console.error(JSON.stringify(j).slice(0,300));process.exit(1)}
fs.writeFileSync(process.argv[1],Buffer.from(j.data[0].b64_json,"base64"));
console.log("saved",process.argv[1],fs.statSync(process.argv[1]).size);' "$OUT"

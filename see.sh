#!/bin/bash
# 用法: ./see.sh 图片路径 [问题]
KEY=$(sed -n 's/^ *SZ_API_KEY: *//p' /root/.dsh/.credentials.yaml | tr -d '"'"'"' \r')
IMG="$1"; Q="${2:-这张图里有什么？用中文描述。}"
MIME=$(file -b --mime-type "$IMG")
B64=$(base64 -w0 "$IMG")
node -e '
const [mime,b64,q]=process.argv.slice(1);
process.stdout.write(JSON.stringify({model:"claude-sonnet-4-5-20250929",max_tokens:1024,
 messages:[{role:"user",content:[{type:"text",text:q},{type:"image_url",image_url:{url:`data:${mime};base64,${b64}`}}]}]}));' "$MIME" "$B64" "$Q" > /tmp/see.json
curl -s -m 120 https://napi.noi-zl.top/v1/chat/completions \
 -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' --data-binary @/tmp/see.json \
 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.choices?.[0]?.message?.content ?? s)})'

#!/usr/bin/env bash
# 通用 APK 打包：javac -> d8 -> aapt2 link -> zipalign -> apksigner
# 用法:
#   build-apk.sh -s SRC_DIR -m AndroidManifest.xml [-r RES_DIR] [-e "extra1.jar:extra2.jar"]
#                [-o out.apk] [-n workname] [--min-sdk 26] [--target-sdk 34] [--v1]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/env.sh"

SRC=""; MAN=""; RES=""; EXTRA=""; OUT=""; NAME="build"; MIN=26; TGT=34; V1=0
while [ $# -gt 0 ]; do
  case "$1" in
    -s) SRC="$2"; shift 2;;
    -m) MAN="$2"; shift 2;;
    -r) RES="$2"; shift 2;;
    -e) EXTRA="$2"; shift 2;;
    -o) OUT="$2"; shift 2;;
    -n) NAME="$2"; shift 2;;
    --min-sdk) MIN="$2"; shift 2;;
    --target-sdk) TGT="$2"; shift 2;;
    --v1) V1=1; shift;;
    -h|--help) sed -n '2,6p' "$0"; exit 0;;
    *) echo "未知参数: $1"; exit 2;;
  esac
done
[ -n "$SRC" ] && [ -n "$MAN" ] || { echo "必须给 -s 源码目录 和 -m AndroidManifest.xml"; exit 2; }
[ -f "$MAN" ] || { echo "manifest 不存在: $MAN"; exit 2; }
OUT="${OUT:-$AB_OUT/$NAME.apk}"

W="$AB_HOME/build/$NAME"
rm -rf "$W"; mkdir -p "$W/classes" "$W/dex"

CP="$ANDROID_JAR${EXTRA:+:$EXTRA}"
echo "[1/6] javac"
javac -nowarn --release 11 -classpath "$CP" -d "$W/classes" $(find "$SRC" -name '*.java')

echo "[2/6] d8"
java -cp "$D8_JAR" com.android.tools.r8.D8 --min-api "$MIN" --lib "$ANDROID_JAR" \
  --output "$W/dex" $(find "$W/classes" -name '*.class') \
  ${EXTRA:+$(echo "$EXTRA" | tr ':' ' ')}

echo "[3/6] aapt2"
if [ -n "$RES" ]; then
  aapt2 compile --dir "$RES" -o "$W/res.zip"
  aapt2 link -o "$W/base.apk" -I "$ANDROID_JAR" --manifest "$MAN" \
    --min-sdk-version "$MIN" --target-sdk-version "$TGT" "$W/res.zip"
else
  aapt2 link -o "$W/base.apk" -I "$ANDROID_JAR" --manifest "$MAN" \
    --min-sdk-version "$MIN" --target-sdk-version "$TGT"
fi

echo "[4/6] 塞入 classes.dex"
( cd "$W/dex" && zip -X -q "$W/base.apk" classes.dex )

echo "[5/6] zipalign"
zipalign -p -f 4 "$W/base.apk" "$W/aligned.apk"

echo "[6/6] 签名"
SIGNV1="--v1-signing-enabled false"
[ "$V1" = 1 ] && SIGNV1="--v1-signing-enabled true"
mkdir -p "$(dirname "$OUT")"
apksigner sign --ks "$AB_KS" --ks-pass "pass:$AB_KS_PASS" --key-pass "pass:$AB_KS_PASS" \
  --ks-key-alias "$AB_KS_ALIAS" --min-sdk-version "$MIN" $SIGNV1 \
  --v2-signing-enabled true --v3-signing-enabled true --out "$OUT" "$W/aligned.apk"

apksigner verify "$OUT" >/dev/null && echo "✓ 签名有效"
printf "产物: %s\n大小: %s B\nsha256: %s\n" "$OUT" "$(stat -c%s "$OUT")" "$(sha256sum "$OUT" | cut -c1-16)…"

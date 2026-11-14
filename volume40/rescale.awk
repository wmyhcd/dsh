# rescale.awk —— 把媒体音量曲线铺成 n 个档位（百分比坐标线性插值）
# 用法: awk -v n=40 -f rescale.awk default_volume_tables.xml > new.xml
# 只动这两条曲线：DEFAULT_MEDIA_VOLUME_CURVE / DEFAULT_DEVICE_CATEGORY_SPEAKER_VOLUME_CURVE
BEGIN { m = 0; on = 0 }

function interp(p,   k) {
    if (m < 1) return 0
    if (p <= idx[1]) return db[1]
    for (k = 1; k < m; k++)
        if (p <= idx[k + 1])
            return db[k] + (db[k + 1] - db[k]) * (p - idx[k]) / (idx[k + 1] - idx[k])
    return db[m]
}

{
    if (on == 0 && $0 ~ /<reference name="(DEFAULT_MEDIA_VOLUME_CURVE|DEFAULT_DEVICE_CATEGORY_SPEAKER_VOLUME_CURVE)">/) {
        print; on = 1; m = 0; next
    }
    if (on == 1) {
        if ($0 ~ /<point>/) {
            t = $0
            sub(/.*<point>/, "", t); sub(/<\/point>.*/, "", t)
            split(t, kv, ",")
            m++; idx[m] = kv[1] + 0; db[m] = kv[2] + 0
            next
        }
        if ($0 ~ /<\/reference>/) {
            for (i = 0; i < n; i++) {
                p = (n > 1) ? i * 100 / (n - 1) : 0
                printf "        <point>%d,%d</point>\n", i, int(interp(p))
            }
            print; on = 0; m = 0; next
        }
        next
    }
    print
}

# 构建说明

```bash
cd dsh-plugins-src/dsh-skill-manager
npm pack --pack-destination ../../dsh-plugins
```

产物 `dsh-skill-manager-<version>.tgz` 直接放 `dsh-plugins/`，
profile 里用 `file:./dsh-plugins/dsh-skill-manager-1.0.0.tgz` 引用。

## 装到现有 profile

`dsh plugin add` 只会写 dependencies，**不写 bundles**，两步都要：

```bash
# 1) 解包到 node_modules（npm install 会被 profile 里的 link: 依赖挡掉）
cd ~/.dsh/profiles/web/node_modules
mkdir -p dsh-skill-manager
tar xzf ../../../../sdcard/dsh/dsh-plugins/dsh-skill-manager-1.0.0.tgz \
    -C dsh-skill-manager --strip-components=1

# 2) 在 profile/package.json 里两处都加上
#    dependencies: "dsh-skill-manager": "file:./dsh-plugins/dsh-skill-manager-1.0.0.tgz"
#    dsh.profile.bundles: "dsh-skill-manager"
```

然后重启 `dsh web`。

## 自检

```bash
node ../../verify.mjs    # 见仓库里的校验脚本说明
```

或者直接看这几个点：

- `package.json` 的 `exports["./client"]` 能解析到真实文件
- `lib/client.js` 以 `window.__ModuleLoader__.load({ id: "<包名>", factory })` 开头
- `lib/client.js` 末尾 `module.exports = { apply, inject: [...] }`
- `dsh.client.inject` 里含 `@deepseek-ai/dsh-client-ui-settings-general`（槽位声明方）
- `lib/index.js` 导出 `apply` 和 `inject = ['webServer']`

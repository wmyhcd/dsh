# 构建说明

```bash
cd dsh-plugins-src/dsh-preset-sync
npm pack --pack-destination ../../dsh-plugins
```

产物 `dsh-preset-sync-<version>.tgz` 放到 `dsh-plugins/`，
profile 里用 `file:./dsh-plugins/dsh-preset-sync-1.0.0.tgz` 引用。

## 装到现有 profile

`dsh plugin add` 只写 dependencies，**不写 bundles**，两处都要加：

```bash
# 1) 把 tgz 拷进 profile 的插件目录
mkdir -p ~/.dsh/profiles/<profile>/dsh-plugins
cp dsh-plugins/dsh-preset-sync-1.0.0.tgz ~/.dsh/profiles/<profile>/dsh-plugins/
```

2) 在 `profiles/<profile>/package.json` 里两处都加上：

```jsonc
{
  "dependencies": {
    "dsh-preset-sync": "file:./dsh-plugins/dsh-preset-sync-1.0.0.tgz"
  },
  "dsh": {
    "profile": {
      "bundles": [ /* ..., */ "dsh-preset-sync" ]
    }
  }
}
```

3) 装依赖并重启：

```bash
dsh plugin --profile <profile> install
```

## 或者直接挂源码（开发时方便）

```bash
dsh plugin --profile <profile> add link:/path/to/dsh-plugins-src/dsh-preset-sync
```

源码改了不用重新打包，HMR 会重新装配；但记得把它加进 `dsh.profile.bundles`。

## 自检

```bash
node test/dryrun.mjs
```

干跑测试会把真实的 Host / Client 代码放进假 ctx 里执行，不需要启动 DSH。它覆盖：

- 路由注册（`/api/dsh-preset-sync`）
- `sync.preview` / `sync.run` / 只同步指定 session
- 运行中会话被跳过、无 preset 会话被跳过
- 未知方法、坏报文被拒
- Client 侧 `main` + `sidebar.panellist` 两个槽位注册

手工检查这几点：

- `package.json` 的 `exports["./client"]` 能解析到真实文件 `lib/client.js`
- `lib/client.js` 以 `window.__ModuleLoader__.load({ id: "dsh-preset-sync", factory })` 开头
- `dsh.client.inject` 里含槽位声明方：`dsh-client-ui-layout`（`main`）与 `dsh-client-ui-sidebar`（`sidebar.panellist`）
- `lib/index.js` 导出 `apply` 和 `inject = ['connection']`
- `cordis.patch.yml` 的 `id` 与 `lib/index.js` 导出的 `name` 语义一致（这里是 `preset-sync` / `name: 'dsh-preset-sync'`）

## 已知注意

- 客户端 UI 文案目前是中文硬编码，没走 Client 的 locale 服务。
- 同步会换掉会话正在用的工具集和提示词，历史记录本身不动。
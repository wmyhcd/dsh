# dev-env —— 编程环境（套餐：C/C++ + Clang + 终端 + sqlite/redis + Go + PHP + Ruby）

> 未装：Rust / Cargo、Gradle / Kotlin、Pandoc / TeX、QEMU（按需求排除）

## 用法
```bash
. /root/dev-env/env.sh      # 导出 Go / GOPATH / bin 到 PATH（.bashrc 已自动加载）
/root/dev-env/setup.sh      # 幂等复原，缺什么补什么
```

## 清单

| 类别 | 工具 | 来源 |
|---|---|---|
| C/C++ | `gcc` `g++` `make` `cmake` `pkg-config` | apt: build-essential, cmake |
| LLVM | `clang` `lld` | apt |
| 终端 | `tmux` `nvim` `fzf` `bat` `htop` `tree` | apt |
| 数据库 | `sqlite3` `redis-server` | apt |
| Go | `go`（官方 aarch64 tarball，装在 `/opt/go`） | go.dev / golang.google.cn 镜像回退 |
| PHP | `php` `composer` | apt |
| Ruby | `ruby` `gem` | apt |
| 原有 | `node 22` `npm` `pnpm` `python 3.12` `java 21` `jq` `rg` `fd` `ffmpeg` `imagemagick` | 容器自带 |

## 实测版本（已跑通功能测试，不只是 诊断）

| 工具 | 版本 | 实测 |
|---|---|---|
| gcc / g++ | 13.3.0 | ✅ 编译并运行 hello |
| clang / lld | 18.1.3 | ✅ 同上，输出一致 |
| make | 4.3 | ✅ |
| cmake | 3.28.3 | ✅ 生成并构建 C++ 工程 |
| go | **1.27.3**（官方 arm64 tar） | ✅ `go mod init` + build + 运行 |
| php | 8.3.6 | ✅ |
| composer | 2.7.1 | ✅ `composer validate` |
| ruby / gem | 3.2.3 / 3.4.20 | ✅ |
| sqlite3 | 3.45.1 | ✅ 建表/插入/查询 |
| redis-server | 7.0.15 | ✅ 起服 → PING → SET/GET → shutdown |
| tmux / nvim / fzf / bat / htop / tree | 3.4 / 0.9.5 / 0.44.1 / 0.24.0 / 3.3.0 / 2.1.1 | ✅ |

**磁盘代价：约 1 GB**（llvm-18 199 M + go 277 M + gcc/glibc/php/ruby 及其依赖）。

## 机器限制（重要）
- **内存只有约 2.4 G 可用，且没有 swap**（`swapon` 需要 root）。编译大项目会 OOM：
  - `go build` 基本无压力；
  - `g++`/`clang` 编译单个中等源文件没问题，但**并行 `make -j8` 会吃满**，建议 `-j2`；
  - C++ 模板重的库（如 LLVM 自举）不要在这台机器上尝试。
- **没有 systemd**：`redis-server` 不能用 `systemctl start`，
  手动起：`redis-server --daemonize yes`，看状态：`redis-cli ping`，停：`redis-cli shutdown`。
- **没有 GUI**：`nvim` 只做终端编辑；图形调试器（gdb-tui 可以，`cgdb` 需要 ncurses 可用）。
- **aarch64**：少数只有 x86_64 的二进制的工具，需要 QEMU user-static（本套餐未装）。

## 常见用法
```bash
# C
printf '#include <stdio.h>\nint main(){puts("hi");}\n' > a.c && gcc a.c -o a && ./a

# C++ / CMake
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j2

# Go
go mod init demo && go build -o demo . && ./demo
go env -w GOPROXY=https://goproxy.cn,direct   # 国内代理，建议设一次

# PHP
composer --version
php -r 'echo PHP_VERSION, PHP_EOL;'

# Ruby
ruby -e 'puts RUBY_VERSION'

# redis
redis-server --daemonize yes && redis-cli ping && redis-cli shutdown
```

## 坑
1. `apt` 官方源在 arm64 上会 404，必须用 `mirrors.aliyun.com/ubuntu-ports`（脚本会自动检查/切换）。
2. `composer` 依赖 `php-mbstring`/`php-curl` 等，apt 的 composer 包会一并拉；单独 `apt install composer` 后若报缺扩展，补 `php-mbstring php-xml php-curl`。
3. Go 默认 `GOPROXY` 走 proxy.golang.org，国内常失败 → `go env -w GOPROXY=https://goproxy.cn,direct`。
4. `redis-server` 默认监听 6379 且无密码，本机自用没问题，**别把端口暴露到局域网**。
5. `composer` 以 root 运行会警告（`Do not run Composer as root`）；要跑插件/脚本时加 `COMPOSER_ALLOW_SUPERUSER=1`。
6. Ubuntu 的 `bat` 二进制名是 **`batcat`**，脚本已建软链 `/usr/local/bin/bat` → `batcat`。
7. `/sdcard` 不支持原子 rename，脚本产物写 `/root` 下，需要交付时再 `cp` 出去。

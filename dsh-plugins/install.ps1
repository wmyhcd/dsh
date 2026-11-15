# DSH 插件一次性安装（Windows PowerShell）
param([string]$Profile = "web", [string]$Template = "profile-template.json")
$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$DshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME ".dsh" }
$PDir = Join-Path $DshHome "profiles\$Profile"

if (-not (Get-Command dsh -ErrorAction SilentlyContinue)) { throw "PATH 里没有 dsh" }
if (-not (Test-Path (Join-Path $PDir "package.json"))) { throw "找不到 $PDir\package.json，先跑一次 dsh $Profile" }

Write-Host ">>> profile: $PDir"
Write-Host ">>> 模板: $Template"
$plugDir = Join-Path $PDir "dsh-plugins"
New-Item -ItemType Directory -Force -Path $plugDir | Out-Null
Copy-Item -Path (Join-Path $Here "*.tgz") -Destination $plugDir -Force
Write-Host ">>> 插件包已拷入 $plugDir"

Write-Host ">>> 合并 package.json"
node (Join-Path $Here "merge-profile.mjs") $Profile $Template
if ($LASTEXITCODE -ne 0) { throw "合并失败" }

Write-Host ">>> 安装依赖"
dsh plugin --profile $Profile install
if ($LASTEXITCODE -ne 0) { throw "安装失败" }

Write-Host ""
Write-Host "完成。重启 dsh $Profile 生效。"

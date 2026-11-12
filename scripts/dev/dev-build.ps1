#Requires -Version 5.1
<#
.SYNOPSIS
  Local BUILD for g21_airplay / g21-airplay-open. Never touches the head unit.
#>
param(
    [switch]$NativeHint
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')
$repo = Get-DevRepoRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js is required on PATH.'
}

Write-Host "BUILD repo=$repo"
& node (Join-Path $repo 'tools\validate_repo.js')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& node (Join-Path $repo 'tools\test_all.js')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$app = Get-Content -Raw -LiteralPath (Join-Path $repo 'apps\g21_airplay\mgu-app.json') | ConvertFrom-Json
$tool = Get-Content -Raw -LiteralPath (Join-Path $repo 'native\g21-airplay-open\component.json') | ConvertFrom-Json
Write-Host ("OK app={0} v{1} tool={2} v{3}" -f $app.id, $app.version, $tool.id, $tool.version)

if ($NativeHint) {
    Write-Host @'
Native binaries (g21-rdp, g21-detach, uxplay.bin) are rebuilt under WSL/gcc when sources change.
Example:
  wsl bash -lc "gcc -O2 -static -o native/g21-airplay-open/g21-detach native/g21-airplay-open/g21-detach.c"
  node tools/regen_airplay_component.js
Nothing was installed on the MGU.
'@
}

Write-Host 'BUILD finished locally. No SSH, no Store install.'
exit 0

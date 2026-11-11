#Requires -Version 5.1
<#
.SYNOPSIS
  Describe the update the MGU Store will see on this branch. Never writes to a head unit.

.PARAMETER ConfirmDeviceWrite
  Always refused. The car installs and updates from the Store after the owner adds this repository.
#>
param(
    [switch]$ConfirmDeviceWrite
)

$ErrorActionPreference = 'Stop'
if ($ConfirmDeviceWrite) {
    throw 'This repository has no head-unit write command. The MGU Store installs and updates this branch after you add the repository.'
}

$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
& node (Join-Path $repo 'tools\validate_repo.js')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$meta = Get-Content -Raw -LiteralPath (Join-Path $repo 'apps\g21_hello\mgu-app.json') | ConvertFrom-Json
$plan = [ordered]@{
    layout = 'repo-tree'
    channel = 'branch'
    app = $meta.id
    version = $meta.version
    install = 'MGU Store: Add source, choose this branch, Install.'
    update = 'Push a newer commit of this branch. In the Store, open Installed and tap Update. Updates do not install themselves.'
    artifact = 'none'
    deviceWrite = $false
}
$dist = Join-Path $repo 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$planPath = Join-Path $dist 'publish-plan.json'
$plan | ConvertTo-Json | Set-Content -LiteralPath $planPath -Encoding utf8
Write-Host "Wrote $planPath"
Write-Host ("Store version on this branch: {0} {1}" -f $meta.id, $meta.version)
Write-Host 'Nothing was sent to a head unit or to GitHub.'

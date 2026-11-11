#Requires -Version 5.1
<#
.SYNOPSIS
  Show how to remove the template app. Does not connect to a head unit.
#>
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$releasePath = Join-Path $repo 'apps\g21_hello\release.json'
$release = Get-Content -Raw -LiteralPath $releasePath | ConvertFrom-Json
if ($release.uninstallable -ne $true) {
    throw 'g21_hello is not marked uninstallable. Fix release.json before trusting a Store removal.'
}

Write-Host 'g21_hello is marked uninstallable in release.json.'
Write-Host 'Removal is done on the car, by the owner, from the MGU Store:'
Write-Host '  Installed -> G21 Hello -> Remove'
Write-Host 'The Store does not install updates on its own. Decline an update to keep the installed version.'
Write-Host 'This script does not open SSH and does not remove anything.'

#Requires -Version 5.1
<#
.SYNOPSIS
  Local tests + optional read-only remote smoke (no process starts on MGU).
#>
param(
    [switch]$RemoteSmoke,
    [string]$Identity,
    [string]$HostName,
    [switch]$AllowClusterHudCheck
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')
$repo = Get-DevRepoRoot
$cfg = Get-DevSshDefaults
if (-not $HostName) { $HostName = $cfg.HostName }

Write-Host 'TEST local...'
& node (Join-Path $repo 'tools\test_all.js')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host 'Local tests OK.'

if (-not $RemoteSmoke) {
    Write-Host 'Skip remote smoke (pass -RemoteSmoke for read-only SSH checks).'
    exit 0
}

$id = Get-DevSshIdentity -Identity $Identity
Test-DevSshConnection -Identity $id -HostName $HostName -User $cfg.User -Port $cfg.Port

$remote = 'echo BEGIN-SMOKE; echo -n allow=; cat /run/g21-session/allow 2>/dev/null; echo; echo -n air=; cat /run/g21-airplay.status 2>/dev/null; echo; echo -n desk=; cat /run/g21-desktop.status 2>/dev/null; echo; echo -n tool=; readlink -f /var/opt/g21-airplay-open/current 2>/dev/null; echo; head -n 6 /var/opt/public/oap/oap_12249/source/package.json 2>/dev/null; ps w 2>/dev/null | grep /var/opt/g21-airplay-open/current/ | grep -v grep; netstat -ltn 2>/dev/null | grep 7400; netstat -ltn 2>/dev/null | grep 1235; netstat -ltn 2>/dev/null | grep 1055; echo END-SMOKE'
$code = Invoke-DevSsh -Identity $id -HostName $HostName -User $cfg.User -Port $cfg.Port -RemoteCommand $remote
if ($code -ne 0) { exit $code }

if ($AllowClusterHudCheck) {
    Write-Host 'Cluster/HUD live draw is NOT run automatically. Approve separately if needed.'
} else {
    Write-Host 'Remote smoke is read-only. No cluster/HUD draw, no restarts.'
}
exit 0

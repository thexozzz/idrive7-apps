#Requires -Version 5.1
<#
.SYNOPSIS
  Pull read-only logs for g21_airplay / g21-airplay-open into 1/dev-logs/.
#>
param(
    [string]$Identity,
    [string]$HostName,
    [int]$Tail = 120
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')
$cfg = Get-DevSshDefaults
if (-not $HostName) { $HostName = $cfg.HostName }
if ($Tail -lt 20) { $Tail = 20 }
if ($Tail -gt 2000) { $Tail = 2000 }

$id = Get-DevSshIdentity -Identity $Identity
Test-DevSshConnection -Identity $id -HostName $HostName -User $cfg.User -Port $cfg.Port

$remote = @"
echo BEGIN-LOGS
tail -n $Tail /var/log/g21-uxplay.log 2>/dev/null | sed 's/^/[uxplay] /'
tail -n $Tail /var/log/g21-rdp.log 2>/dev/null | sed 's/^/[rdp] /'
tail -n $Tail /var/log/g21-present.log 2>/dev/null | sed 's/^/[present] /'
tail -n $Tail /var/log/g21-avahi.log 2>/dev/null | sed 's/^/[avahi] /'
tail -n $Tail /var/log/g21-mice.log 2>/dev/null | sed 's/^/[mice] /'
tail -n $Tail /tmp/g21-airplay-start.log 2>/dev/null | sed 's/^/[start] /'
echo -n '[status] air='; cat /run/g21-airplay.status 2>/dev/null; echo
echo -n '[status] desk='; cat /run/g21-desktop.status 2>/dev/null; echo
echo -n '[status] allow='; cat /run/g21-session/allow 2>/dev/null; echo
echo -n '[status] output='; cat /run/g21-session/output 2>/dev/null; echo
echo '[uxplay-errors]'
grep -E 'ERROR|dns|DNS|RAOP|Stopping|Unknown' /var/log/g21-uxplay.log 2>/dev/null | tail -n 40
echo END-LOGS
"@
$remote = ($remote -replace "`r`n", "`n") -replace "`r", "`n"

$outDir = Get-DevLocalLogsDir
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outFile = Join-Path $outDir "mgu-logs-$stamp.txt"
Write-Host "Fetching logs -> $outFile"

& ssh.exe @(
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=10',
    '-o', 'IdentitiesOnly=yes',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'UpdateHostKeys=no',
    '-i', $id,
    '-p', "$($cfg.Port)",
    "$($cfg.User)@$HostName",
    $remote
) | Tee-Object -FilePath $outFile | ForEach-Object { Write-Host $_ }

Write-Host "Saved $outFile (gitignored under 1/dev-logs/)."
exit $LASTEXITCODE

#Requires -Version 5.1
<#
.SYNOPSIS
  Restore previous HotPatch backup for g21-airplay-open / g21_airplay only.
#>
param(
    [Parameter(Mandatory = $true)][string]$BackupStamp,
    [switch]$AllowMguWrite,
    [string]$ConfirmPhrase = '',
    [string]$Identity,
    [string]$HostName
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')
$cfg = Get-DevSshDefaults
if (-not $HostName) { $HostName = $cfg.HostName }

if (-not $AllowMguWrite) {
    throw 'Rollback refused without -AllowMguWrite.'
}
if ($ConfirmPhrase -ne 'DEPLOY-G21-AIRPLAY') {
    throw 'Rollback refused: -ConfirmPhrase must be DEPLOY-G21-AIRPLAY'
}
if ($BackupStamp -notmatch '^[0-9]{8}-[0-9]{6}$') {
    throw 'BackupStamp must look like yyyyMMdd-HHmmss'
}

$id = Get-DevSshIdentity -Identity $Identity
Test-DevSshConnection -Identity $id -HostName $HostName -User $cfg.User -Port $cfg.Port

$backup = "/var/opt/g21-airplay-open/dev-backup/$BackupStamp"
if (-not (Test-DevRemotePathAllowed -RemotePath "$backup/" -Roots $cfg.AllowWriteRoots)) {
    throw "Backup path not allowlisted: $backup"
}

$remote = @"
set -e
backup='$backup'
test -d "`$backup" || { echo missing-backup; exit 40; }
tool_cur=`$(readlink -f /var/opt/g21-airplay-open/current)
if [ -d "`$backup/tool" ] && [ -n "`$tool_cur" ]; then
  for f in `$backup/tool/*; do
    base=`$(basename "`$f")
    cp -a "`$f" "`$tool_cur/`$base"
    case `$base in g21-*|uxplay|run-elf) chmod 755 "`$tool_cur/`$base" ;; esac
  done
  echo tool-restored=`$tool_cur
fi
if [ -d "`$backup/app" ]; then
  src=/var/opt/public/oap/oap_12249/source
  grep -q '"name"[[:space:]]*:[[:space:]]*"g21_airplay"' "`$src/package.json"
  for f in `$backup/app/*; do
    base=`$(basename "`$f")
    cp -a "`$f" "`$src/`$base"
  done
  echo app-restored=`$src
fi
echo ROLLBACK-DONE
"@

$code = Invoke-DevSsh -Identity $id -HostName $HostName -User $cfg.User -Port $cfg.Port -RemoteCommand $remote -AllowWrite
if ($code -ne 0) { throw "Rollback failed ($code)" }
Write-Host "Rollback OK from $backup"
exit 0

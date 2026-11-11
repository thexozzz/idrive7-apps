#Requires -Version 5.1
<#
.SYNOPSIS
  Read-only SSH check of an iDrive 7 head unit.

.DESCRIPTION
  Runs a fixed command list. It does not accept a remote command argument,
  does not copy files, and does not restart services.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Identity,
    [string]$HostName = '172.16.222.97',
    [int]$Port = 22,
    [string]$User = 'root'
)

$ErrorActionPreference = 'Stop'

if ($HostName -notmatch '^[A-Za-z0-9.\-]+$') { throw 'Host name contains unsupported characters.' }
if ($Port -lt 1 -or $Port -gt 65535) { throw 'Port is outside 1-65535.' }
if ($User -notmatch '^[a-z_][a-z0-9_-]{0,31}$') { throw 'SSH user contains unsupported characters.' }
if (-not (Test-Path -LiteralPath $Identity -PathType Leaf)) { throw "Identity file not found: $Identity" }

$resolved = (Resolve-Path -LiteralPath $Identity).Path
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if ($resolved.StartsWith($repo, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing an identity file stored inside this repository.'
}
if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
    throw 'OpenSSH client (ssh) is not on PATH.'
}

$remote = @(
    'echo BEGIN-DIAG',
    'uname -srm || true',
    'node -v || true',
    'pidof HmiMain3D || true',
    'systemctl is-active oapcontroller.service || true',
    'systemctl is-active mgu-render.service || true',
    'systemctl is-active idrive7-renderd.service || true',
    'if [ -d /usr/lib/oap-mainapp ]; then echo mainapp=present; else echo mainapp=absent; fi',
    'if [ -d /var/opt/public/oap ]; then ls -1 /var/opt/public/oap | head -n 40; else echo oap-data=absent; fi',
    'echo END-DIAG'
) -join '; '

Write-Host 'Read-only diagnostic. No files are written on the head unit.'
& ssh.exe @(
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=8',
    '-o', 'IdentitiesOnly=yes',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-i', $resolved,
    '-p', "$Port",
    "$User@$HostName",
    $remote
)
exit $LASTEXITCODE

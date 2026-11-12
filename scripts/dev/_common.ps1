#Requires -Version 5.1
<#
.SYNOPSIS
  Shared helpers for safe g21_airplay / g21-airplay-open developer scripts.
  Never writes to the head unit by itself.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-DevRepoRoot {
    return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
}

function Get-DevWorkspaceRoot {
    return (Resolve-Path -LiteralPath (Join-Path (Get-DevRepoRoot) '..')).Path
}

function Get-DevSshIdentity {
    param([string]$Identity)
    $candidates = @()
    if ($Identity) { $candidates += $Identity }
    $candidates += @(
        (Join-Path $env:USERPROFILE '.ssh\g21_mgu_root'),
        (Join-Path $env:TEMP 'mgu-read-only\id_rsa')
    )
    $repo = Get-DevRepoRoot
    foreach ($c in $candidates) {
        if (-not $c) { continue }
        if (-not (Test-Path -LiteralPath $c -PathType Leaf)) { continue }
        $resolved = (Resolve-Path -LiteralPath $c).Path
        if ($resolved.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing SSH identity inside the repository: $resolved"
        }
        return $resolved
    }
    throw 'SSH identity not found. Place key outside the repo (e.g. %USERPROFILE%\.ssh\g21_mgu_root).'
}

function Get-DevSshDefaults {
    [pscustomobject]@{
        HostName = '100.125.63.29'
        User     = 'root'
        Port     = 22
        AppId    = 'g21_airplay'
        ToolId   = 'g21-airplay-open'
        OapUid   = '12249'
        # Only these remote roots may ever be written by HotPatch (after explicit consent).
        AllowWriteRoots = @(
            '/var/opt/g21-airplay-open/',
            '/var/opt/public/oap/oap_12249/data/g21_airplay/',
            '/var/opt/public/oap/oap_12249/source/'
        )
        # Exact cmdline path fragments required before any stop attempt.
        OwnProcessMarkers = @(
            '/var/opt/g21-airplay-open/current/g21-airplay-open',
            '/var/opt/g21-airplay-open/current/uxplay.bin',
            '/var/opt/g21-airplay-open/current/g21-rdp',
            '/var/opt/g21-airplay-open/current/g21-present',
            '/var/opt/g21-airplay-open/current/g21-mice',
            '/var/opt/g21-airplay-open/current/avahi-daemon',
            '/var/opt/g21-airplay-open/current/g21-detach'
        )
        AppLogPaths = @(
            '/var/log/g21-uxplay.log',
            '/var/log/g21-rdp.log',
            '/var/log/g21-present.log',
            '/var/log/g21-avahi.log',
            '/var/log/g21-mice.log',
            '/tmp/g21-airplay-start.log',
            '/run/g21-airplay.status',
            '/run/g21-desktop.status',
            '/run/g21-session/allow',
            '/run/g21-session/output'
        )
    }
}

function Test-DevRemotePathAllowed {
    param(
        [Parameter(Mandatory = $true)][string]$RemotePath,
        [string[]]$Roots
    )
    $norm = $RemotePath.Replace('\', '/')
    if ($norm.Contains('..')) { return $false }
    foreach ($root in $Roots) {
        if ($norm.StartsWith($root, [StringComparison]::Ordinal)) { return $true }
    }
    return $false
}

function Invoke-DevSsh {
    param(
        [Parameter(Mandatory = $true)][string]$Identity,
        [string]$HostName = '100.125.63.29',
        [string]$User = 'root',
        [int]$Port = 22,
        [Parameter(Mandatory = $true)][string]$RemoteCommand,
        [switch]$AllowWrite
    )
    if ($HostName -notmatch '^[A-Za-z0-9.\-]+$') { throw 'Invalid SSH host name.' }
    if ($User -notmatch '^[a-z_][a-z0-9_-]{0,31}$') { throw 'Invalid SSH user.' }
    if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
        throw 'OpenSSH client (ssh) is not on PATH.'
    }
    # BusyBox ash rejects CR from Windows here-strings (`set +e` → illegal option).
    $RemoteCommand = ($RemoteCommand -replace "`r`n", "`n") -replace "`r", "`n"
    # Host key verification is mandatory. Do not use accept-new / no / off here.
    $sshArgs = @(
        '-o', 'BatchMode=yes',
        '-o', 'ConnectTimeout=10',
        '-o', 'IdentitiesOnly=yes',
        '-o', 'StrictHostKeyChecking=yes',
        '-o', 'UpdateHostKeys=no',
        '-i', $Identity,
        '-p', "$Port",
        "${User}@${HostName}",
        $RemoteCommand
    )
    if (-not $AllowWrite) {
        # Soft guard: refuse obvious write shells in the remote command string.
        $banned = @(
            'systemctl restart', 'systemctl stop', 'systemctl start',
            'nft ', 'iptables', 'reboot', 'halt', 'poweroff',
            'killall', 'pkill', 'rm -rf /', 'chmod -R', '> /etc/',
            'tee /etc/', 'mount ', 'umount '
        )
        foreach ($b in $banned) {
            if ($RemoteCommand.IndexOf($b, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
                throw "Read-only SSH refused banned fragment: $b"
            }
        }
    }
    # Must not emit SSH stdout on the success stream — callers assign the return
    # value and would otherwise capture remote output as $code.
    & ssh.exe @sshArgs 2>&1 | ForEach-Object { Write-Host $_ }
    $code = $LASTEXITCODE
    if ($null -eq $code) { $code = 1 }
    return [int]$code
}

function Test-DevSshConnection {
    param(
        [Parameter(Mandatory = $true)][string]$Identity,
        [string]$HostName = '100.125.63.29',
        [string]$User = 'root',
        [int]$Port = 22
    )
    Write-Host "Checking SSH $User@$HostName (StrictHostKeyChecking=yes)..."
    # Keep remote scripts BusyBox-safe (no `set +e`, minimal quoting).
    $code = Invoke-DevSsh -Identity $Identity -HostName $HostName -User $User -Port $Port -RemoteCommand 'echo DEV-SSH-OK; uname -srm; test -d /var/opt/g21-airplay-open/current && echo tool=present || echo tool=missing; test -d /var/opt/public/oap/oap_12249/data/g21_airplay && echo appdata=present || echo appdata=missing; head -n 8 /var/opt/public/oap/oap_12249/source/package.json 2>/dev/null; readlink -f /var/opt/g21-airplay-open/current 2>/dev/null; echo DEV-SSH-END'
    if ($code -ne 0) {
        Write-Host @'
SSH failed.
If the message mentions REMOTE HOST IDENTIFICATION HAS CHANGED:
  - Do NOT delete known_hosts entries automatically.
  - Do NOT use StrictHostKeyChecking=no / accept-new for this host.
  - Confirm the MGU identity out-of-band, then update known_hosts yourself.
'@
        throw "SSH connection failed (exit $code)."
    }
    Write-Host 'SSH connection OK; app/tool paths reachable (read-only).'
}

function Get-DevLocalLogsDir {
    $dir = Join-Path (Get-DevRepoRoot) 'dev-logs'
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    return $dir
}

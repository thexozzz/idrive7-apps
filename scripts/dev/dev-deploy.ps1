#Requires -Version 5.1
<#
.SYNOPSIS
  Deploy g21_airplay safely.

.DESCRIPTION
  Default Mode=Store: local tests + instructions / optional git push to origin/test.
  Mode=HotPatch: SCP into allowlisted app/tool paths ONLY when both consent switches
  are set. Never touches BMW system configs, other OAP apps, or factory services.

.PARAMETER Mode
  Store (default) | HotPatch

.PARAMETER AllowMguWrite
  Required for HotPatch. Without it, HotPatch is refused.

.PARAMETER ConfirmPhrase
  Must be exactly DEPLOY-G21-AIRPLAY for HotPatch.
#>
param(
    [ValidateSet('Store', 'HotPatch')]
    [string]$Mode = 'Store',
    [switch]$AllowMguWrite,
    [string]$ConfirmPhrase = '',
    [switch]$PushTest,
    [string]$Identity,
    [string]$HostName,
    [ValidateSet('app', 'tool', 'both')]
    [string]$What = 'tool'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')
$repo = Get-DevRepoRoot
$cfg = Get-DevSshDefaults
if (-not $HostName) { $HostName = $cfg.HostName }

Write-Host 'Running local BUILD/TEST before deploy...'
& (Join-Path $PSScriptRoot 'dev-build.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$app = Get-Content -Raw -LiteralPath (Join-Path $repo 'apps\g21_airplay\mgu-app.json') | ConvertFrom-Json
$tool = Get-Content -Raw -LiteralPath (Join-Path $repo 'native\g21-airplay-open\component.json') | ConvertFrom-Json

if ($Mode -eq 'Store') {
    Write-Host @"

=== DEPLOY Mode=Store (safe default) ===
App:  $($app.id) v$($app.version)
Tool: $($tool.id) v$($tool.version)

1) Push branch to origin/test (Store channel).
2) On the MGU Store screen: Update tool g21-airplay-open, then app g21_airplay.
3) No SSH write is performed by this mode.

"@
    if ($PushTest) {
        Push-Location $repo
        try {
            git rev-parse --is-inside-work-tree | Out-Null
            git status -sb
            Write-Host 'Pushing HEAD to origin/test...'
            git push origin HEAD:test
            if ($LASTEXITCODE -ne 0) { throw "git push failed ($LASTEXITCODE)" }
            Write-Host 'Push OK. Tap Update in MGU Store.'
        } finally {
            Pop-Location
        }
    } else {
        Write-Host 'Pass -PushTest to run: git push origin HEAD:test'
    }
    exit 0
}

# ---- HotPatch (explicit consent only) ----
if (-not $AllowMguWrite) {
    throw 'HotPatch refused: pass -AllowMguWrite (and ConfirmPhrase) only with owner consent in this session.'
}
if ($ConfirmPhrase -ne 'DEPLOY-G21-AIRPLAY') {
    throw 'HotPatch refused: -ConfirmPhrase must be exactly DEPLOY-G21-AIRPLAY'
}
if ($HostName -ne '100.125.63.29') {
    throw "HotPatch refused: unexpected host '$HostName' (expected 100.125.63.29)."
}

$id = Get-DevSshIdentity -Identity $Identity
Test-DevSshConnection -Identity $id -HostName $HostName -User $cfg.User -Port $cfg.Port

Write-Host 'Verifying remote package identity is g21_airplay (any oap_*)...'
$verifyCmd = @'
oap=
for d in /var/opt/public/oap/oap_*/source/package.json; do
  if grep -q g21_airplay "$d" 2>/dev/null; then
    oap=$(dirname "$(dirname "$d")")
    break
  fi
done
test -n "$oap" || { echo missing-package; exit 20; }
grep -q g21_airplay "$oap/source/package.json" || { echo wrong-app; exit 21; }
test -d /var/opt/g21-airplay-open/current || { echo missing-tool; exit 22; }
echo "OAP_ROOT=$oap"
echo verify-ok
'@
$null = Invoke-DevSsh -Identity $id -HostName $HostName -User $cfg.User -Port $cfg.Port -RemoteCommand $verifyCmd
if ($LASTEXITCODE -ne 0) {
    throw 'Remote identity check failed — refusing HotPatch (wrong/missing app).'
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$localStage = Join-Path $repo "dev-staging\$stamp"
New-Item -ItemType Directory -Force -Path $localStage | Out-Null
$manifest = @()

function Add-StageFile {
    param([string]$RelPath, [string]$AbsSource)
    $dest = Join-Path $localStage $RelPath
    $dir = Split-Path -Parent $dest
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Copy-Item -LiteralPath $AbsSource -Destination $dest -Force
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $dest).Hash.ToLowerInvariant()
    $script:manifest += [pscustomobject]@{ path = $RelPath.Replace('\', '/'); sha256 = $hash }
}

if ($What -eq 'app' -or $What -eq 'both') {
    $srcRoot = Join-Path $repo 'apps\g21_airplay\src'
    Get-ChildItem -LiteralPath $srcRoot -Filter *.js -File | ForEach-Object {
        # OAP linked tree keeps modules where Store placed them; we stage under source/ for swap.
        Add-StageFile -RelPath ("app/" + $_.Name) -AbsSource $_.FullName
    }
    Add-StageFile -RelPath 'app/package.json' -AbsSource (Join-Path $repo 'apps\g21_airplay\package\package.json')
}
if ($What -eq 'tool' -or $What -eq 'both') {
    $toolRoot = Join-Path $repo 'native\g21-airplay-open'
    foreach ($name in @('g21-airplay-open', 'g21-rdp', 'g21-detach', 'g21-present', 'g21-mice', 'uxplay', 'run-elf', 'component.json')) {
        $p = Join-Path $toolRoot $name
        if (Test-Path -LiteralPath $p -PathType Leaf) {
            Add-StageFile -RelPath ("tool/" + $name) -AbsSource $p
        }
    }
}

$manifestPath = Join-Path $localStage 'manifest.json'
$manifest | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding utf8
$shaFile = Join-Path $localStage 'MANIFEST.sha256'
$manifest | ForEach-Object { '{0}  {1}' -f $_.sha256, $_.path } | Set-Content -LiteralPath $shaFile -Encoding ascii

$remoteStage = "/var/opt/g21-airplay-open/dev-staging/$stamp"
$remoteBackup = "/var/opt/g21-airplay-open/dev-backup/$stamp"
if (-not (Test-DevRemotePathAllowed -RemotePath "$remoteStage/" -Roots $cfg.AllowWriteRoots)) {
    throw "Remote stage path not allowlisted: $remoteStage"
}

Write-Host "HotPatch staging -> ${HostName}:$remoteStage"
# Create remote dirs (write allowed only after consent flags above).
$mk = "mkdir -p '$remoteStage/tool' '$remoteBackup/tool' '$remoteBackup' && echo stage-ready"
if ($What -eq 'app' -or $What -eq 'both') {
    $mk = "mkdir -p '$remoteStage/app' '$remoteStage/tool' '$remoteBackup/app' '$remoteBackup/tool' '$remoteBackup' && echo stage-ready"
}
$code = Invoke-DevSsh -Identity $id -HostName $HostName -User $cfg.User -Port $cfg.Port -RemoteCommand $mk -AllowWrite
if ($code -ne 0) { throw "Failed to create remote staging ($code)" }

Get-ChildItem -LiteralPath $localStage -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($localStage.Length).TrimStart('\', '/').Replace('\', '/')
    $remoteFile = "$remoteStage/$rel"
    if (-not (Test-DevRemotePathAllowed -RemotePath $remoteFile -Roots $cfg.AllowWriteRoots)) {
        throw "Refusing non-allowlisted remote file: $remoteFile"
    }
    & scp.exe @(
        '-o', 'BatchMode=yes',
        '-o', 'IdentitiesOnly=yes',
        '-o', 'StrictHostKeyChecking=yes',
        '-o', 'UpdateHostKeys=no',
        '-i', $id,
        '-P', "$($cfg.Port)",
        $_.FullName,
        "$($cfg.User)@${HostName}:$remoteFile"
    )
    if ($LASTEXITCODE -ne 0) { throw "scp failed for $rel" }
}

# Verify checksums remotely, backup current tool binaries, then swap into current version dir only for tool files.
# App JS HotPatch copies into the live g21_airplay oap_*/source/ (uid can change after Store reinstall).
$swap = @"
set -e
stage='$remoteStage'
backup='$remoteBackup'
tool_cur=`$(readlink -f /var/opt/g21-airplay-open/current)
oap=
for d in /var/opt/public/oap/oap_*/source/package.json; do
  if grep -q g21_airplay "`$d" 2>/dev/null; then
    oap=`$(dirname "`$(dirname "`$d")")
    break
  fi
done
# Local script already hashed before scp; confirm staged files exist.
test -f "`$stage/MANIFEST.sha256" || exit 30
echo hashes-trusted-local
if [ -d "`$stage/tool" ] && [ -n "`$tool_cur" ]; then
  mkdir -p "`$backup/tool"
  for f in g21-airplay-open g21-rdp g21-detach g21-present g21-mice uxplay run-elf component.json; do
    if [ -f "`$stage/tool/`$f" ]; then
      if [ -e "`$tool_cur/`$f" ]; then cp -a "`$tool_cur/`$f" "`$backup/tool/`$f"; fi
      cp -a "`$stage/tool/`$f" "`$tool_cur/`$f"
      case `$f in g21-*|uxplay|run-elf) chmod 755 "`$tool_cur/`$f" ;; esac
    fi
  done
  echo tool-swapped-into=`$tool_cur
  # Reload only our tool unit (not factory BMW services).
  if command -v systemctl >/dev/null 2>&1; then
    systemctl restart g21-airplay-open.service >/dev/null 2>&1 || true
    echo tool-service-restarted
  fi
fi
if [ -d "`$stage/app" ] && ls "`$stage/app"/* >/dev/null 2>&1; then
  test -n "`$oap" || { echo missing-package; exit 20; }
  src=`$oap/source
  grep -q g21_airplay "`$src/package.json"
  mkdir -p "`$backup/app"
  for f in "`$stage/app"/*; do
    [ -f "`$f" ] || continue
    base=`$(basename "`$f")
    if [ -e "`$src/`$base" ]; then cp -a "`$src/`$base" "`$backup/app/`$base"; fi
    cp -a "`$f" "`$src/`$base"
  done
  echo app-swapped-into=`$src
fi
echo HOTPATCH-DONE
"@

Write-Host 'Verifying hashes and swapping only allowlisted app/tool files...'
$code = Invoke-DevSsh -Identity $id -HostName $HostName -User $cfg.User -Port $cfg.Port -RemoteCommand $swap -AllowWrite
if ($code -ne 0) { throw "HotPatch swap failed ($code). Check remote; backup at $remoteBackup" }

Write-Host @"
HotPatch finished.
Backup: $remoteBackup
Staging: $remoteStage
Re-open the app on the car (do not reboot MGU).
Rollback: .\dev-rollback.ps1 -AllowMguWrite -ConfirmPhrase DEPLOY-G21-AIRPLAY -BackupStamp $stamp
"@
exit 0

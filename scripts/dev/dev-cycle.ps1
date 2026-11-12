#Requires -Version 5.1
<#
.SYNOPSIS
  Full safe cycle: BUILD → DEPLOY(Store) → TEST(remote smoke) → LOGS.
  Never HotPatches or restarts MGU unless you pass HotPatch consent flags.
#>
param(
    [ValidateSet('Store', 'HotPatch')]
    [string]$Mode = 'Store',
    [switch]$PushTest,
    [switch]$AllowMguWrite,
    [string]$ConfirmPhrase = '',
    [string]$Identity,
    [string]$HostName,
    [switch]$SkipRemote
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot

Write-Host '=== 1/4 BUILD ==='
& (Join-Path $here 'dev-build.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '=== 2/4 DEPLOY ==='
$deployArgs = @{ Mode = $Mode }
if ($PushTest) { $deployArgs.PushTest = $true }
if ($AllowMguWrite) { $deployArgs.AllowMguWrite = $true }
if ($ConfirmPhrase) { $deployArgs.ConfirmPhrase = $ConfirmPhrase }
if ($Identity) { $deployArgs.Identity = $Identity }
if ($HostName) { $deployArgs.HostName = $HostName }
& (Join-Path $here 'dev-deploy.ps1') @deployArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($SkipRemote) {
    Write-Host 'Skip remote TEST/LOGS (-SkipRemote).'
    exit 0
}

Write-Host '=== 3/4 TEST (read-only smoke) ==='
$testArgs = @{ RemoteSmoke = $true }
if ($Identity) { $testArgs.Identity = $Identity }
if ($HostName) { $testArgs.HostName = $HostName }
& (Join-Path $here 'dev-test.ps1') @testArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '=== 4/4 LOGS (read-only pull) ==='
$logArgs = @{}
if ($Identity) { $logArgs.Identity = $Identity }
if ($HostName) { $logArgs.HostName = $HostName }
& (Join-Path $here 'dev-logs.ps1') @logArgs
exit $LASTEXITCODE

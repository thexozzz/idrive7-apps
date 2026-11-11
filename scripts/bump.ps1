#Requires -Version 5.1
<#
.SYNOPSIS
  Raise an app version in the source tree. The car is not contacted.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$App,
    [ValidateSet('patch', 'minor', 'major')]
    [string]$Level = 'patch'
)

$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js 18 or newer is required.'
}
& node (Join-Path $PSScriptRoot '..\tools\bump_version.js') $App $Level
exit $LASTEXITCODE

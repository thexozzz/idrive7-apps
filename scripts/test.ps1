#Requires -Version 5.1
<#
.SYNOPSIS
  Run the local test suite. No head unit is contacted.
#>
$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js 18 or newer is required.'
}
& node (Join-Path $PSScriptRoot '..\tools\test_all.js')
exit $LASTEXITCODE

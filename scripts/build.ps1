#Requires -Version 5.1
<#
.SYNOPSIS
  Check the repository contract. Does not link oap-sdk and does not write to a car.
#>
param(
    [string]$SdkDonor
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js 18 or newer is required.'
}

& node (Join-Path $repo 'tools\validate_repo.js')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($SdkDonor) {
    if (-not (Test-Path -LiteralPath $SdkDonor -PathType Leaf)) {
        throw "Donor bundle not found: $SdkDonor"
    }
    $donor = (Resolve-Path -LiteralPath $SdkDonor).Path
    if ($donor.StartsWith($repo, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'Refusing a donor bundle stored inside this repository.'
    }
    Write-Host 'Donor bundle is outside the repository and was not copied.'
    Write-Host 'The head unit links oap-sdk itself when the Store installs this source package.'
}

Write-Host 'Build check finished. No package was linked and nothing was sent to the head unit.'

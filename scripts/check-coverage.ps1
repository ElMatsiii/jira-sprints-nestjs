<#
==============================================================================
MS2 (jira-sprints-nestjs): Coverage Threshold Verification Script (PowerShell)
Parses coverage/coverage-summary.json and asserts >= 60.0% coverage across
statements, branches, functions, and lines.
==============================================================================
#>
param (
    [string]$CoverageFile = "coverage/coverage-summary.json",
    [double]$Threshold = 60.0
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $CoverageFile)) {
    Write-Error "Coverage summary file '$CoverageFile' not found! Run 'npm run test:cov' first."
    exit 1
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "    MS2 (jira-sprints-nestjs) Jest Coverage Verification    " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Summary File       : $CoverageFile"
Write-Host "Required Threshold : $Threshold%"
Write-Host "------------------------------------------------------------"

try {
    $jsonContent = Get-Content -Path $CoverageFile -Raw | ConvertFrom-Json
} catch {
    Write-Error "Failed to parse JSON from $CoverageFile : $_"
    exit 1
}

$total = $jsonContent.total
if (-not $total) {
    Write-Error "No 'total' section found in coverage summary JSON!"
    exit 1
}

$metrics = @("statements", "branches", "functions", "lines")
$failed = $false

foreach ($m in $metrics) {
    $metricData = $total.$m
    $pct = if ($metricData) { [double]$metricData.pct } else { 0.0 }
    $passed = $pct -ge $Threshold
    $label = ("{0,-12}" -f ($m.Substring(0,1).ToUpper() + $m.Substring(1)))
    $pctStr = ("{0,6:N2}%" -f $pct)

    if ($passed) {
        Write-Host "$label : $pctStr  [PASS]" -ForegroundColor Green
    } else {
        Write-Host "$label : $pctStr  [FAIL]" -ForegroundColor Red
        $failed = $true
    }
}

Write-Host "------------------------------------------------------------"

if ($failed) {
    Write-Error "FAILURE: One or more coverage metrics fall below $Threshold% threshold!"
    exit 1
} else {
    Write-Host "SUCCESS: All coverage metrics meet or exceed $Threshold% threshold!" -ForegroundColor Green
    exit 0
}

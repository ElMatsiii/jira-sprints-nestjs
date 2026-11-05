#!/usr/bin/env bash
# ==============================================================================
# MS2 (jira-sprints-nestjs): Coverage Threshold Verification Script
# Parses coverage/coverage-summary.json and asserts >= 60.0% coverage across
# statements, branches, functions, and lines.
# Zero external CLI dependencies (uses node -e).
# ==============================================================================
set -euo pipefail

COVERAGE_FILE="${1:-coverage/coverage-summary.json}"
REQUIRED_THRESHOLD="${2:-60.0}"

if [ ! -f "$COVERAGE_FILE" ]; then
  echo "::error::Coverage summary file '$COVERAGE_FILE' does not exist!"
  echo "Make sure to run 'npm run test:cov' prior to executing this gate."
  exit 1
fi

node -e "
const fs = require('fs');

const summaryPath = process.argv[1];
const threshold = parseFloat(process.argv[2]);

let summary;
try {
  summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
} catch (err) {
  console.error('::error::Failed to parse JSON from ' + summaryPath + ': ' + err.message);
  process.exit(1);
}

const total = summary.total;
if (!total) {
  console.error('::error::No \"total\" coverage metric found in ' + summaryPath);
  process.exit(1);
}

const metrics = ['statements', 'branches', 'functions', 'lines'];
let hasFailure = false;

console.log('============================================================');
console.log('    MS2 (jira-sprints-nestjs) Jest Coverage Verification    ');
console.log('============================================================');
console.log('Summary File       : ' + summaryPath);
console.log('Required Threshold : ' + threshold.toFixed(1) + '%');
console.log('------------------------------------------------------------');

for (const m of metrics) {
  const metricData = total[m];
  const pct = metricData ? metricData.pct : 0.0;
  const passed = pct >= threshold;
  const statusStr = passed ? '✅ PASS' : '❌ FAIL';
  const label = (m.charAt(0).toUpperCase() + m.slice(1)).padEnd(12);
  console.log(label + ' : ' + pct.toFixed(2).padStart(6) + '%  ' + statusStr);
  if (!passed) {
    hasFailure = true;
  }
}

console.log('------------------------------------------------------------');

if (hasFailure) {
  console.error('❌ FAILURE: One or more coverage metrics fall below the required ' + threshold.toFixed(1) + '% threshold!');
  process.exit(1);
} else {
  console.log('✅ SUCCESS: All coverage metrics satisfy >= ' + threshold.toFixed(1) + '% threshold!');
  process.exit(0);
}
" "$COVERAGE_FILE" "$REQUIRED_THRESHOLD"

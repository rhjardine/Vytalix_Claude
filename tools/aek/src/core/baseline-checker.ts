import fs from 'node:fs';
import path from 'node:path';
import type { JsonReport } from '../reporters/json-reporter';

interface Baseline {
  expectedFindings: number;
}

export interface BaselineCheckResult {
  status: 'PASS' | 'FAIL';
  actual: number;
  expected: number;
}

export function checkBaseline(
  repositoryRoot: string,
  reportPath?: string,
  baselinePath?: string,
): BaselineCheckResult {
  const resolvedReport = reportPath ?? path.join(repositoryRoot, '.aek', 'report.json');
  const resolvedBaseline = baselinePath ?? path.join(repositoryRoot, '.aek', 'baseline.json');

  const report = JSON.parse(fs.readFileSync(resolvedReport, 'utf8')) as JsonReport;
  const baseline = JSON.parse(fs.readFileSync(resolvedBaseline, 'utf8')) as Baseline;

  const actual = report.findings.length;
  const expected = baseline.expectedFindings;

  return {
    status: actual <= expected ? 'PASS' : 'FAIL',
    actual,
    expected,
  };
}

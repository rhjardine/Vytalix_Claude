import type { RuleEngineResult } from '../core/rule-engine';

export interface AEKBaselineConfig {
  expectedFindings: number;
}

export interface PolicyResult {
  status: 'PASS' | 'FAIL';
  exitCode: number;
  reason: string;
}

export class AEKPolicyEngine {
  evaluate(engineResult: RuleEngineResult, baseline: AEKBaselineConfig): PolicyResult {
    const actual = engineResult.findings.length;
    const expected = baseline.expectedFindings;
    const pass = actual <= expected;

    return {
      status: pass ? 'PASS' : 'FAIL',
      exitCode: pass ? 0 : 1,
      reason: [
        `AEK Baseline Check — ${pass ? 'PASS' : 'FAIL'}`,
        `  actual findings : ${actual}`,
        `  expected (max)  : ${expected}`,
      ].join('\n'),
    };
  }
}

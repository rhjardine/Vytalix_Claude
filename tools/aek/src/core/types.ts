import type { AnalysisContext } from './analysis-context';

export type FindingSeverity = 'error' | 'warning';

export interface AEKFinding {
  ruleId: string;
  adr: string;
  severity: FindingSeverity;
  message: string;
  from: string;
  to: string;
}

export interface RuleResult {
  ruleId: string;
  findings: AEKFinding[];
}

export interface AEKRule {
  id: string;
  adr: string;
  description: string;
  evaluate(context: AnalysisContext): RuleResult;
}

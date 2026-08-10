import type { AnalysisContext } from './analysis-context';
import type { AEKFinding, AEKRule, RuleResult } from './types';

export interface RuleEngineResult {
  rules: Array<Pick<AEKRule, 'id' | 'adr' | 'description'>>;
  results: RuleResult[];
  findings: AEKFinding[];
}

export class RuleEngine {
  constructor(private readonly rules: AEKRule[]) {}

  evaluate(context: AnalysisContext): RuleEngineResult {
    const results = this.rules.map((rule) => rule.evaluate(context));
    return {
      rules: this.rules.map(({ id, adr, description }) => ({ id, adr, description })),
      results,
      findings: results.flatMap((result) => result.findings),
    };
  }
}

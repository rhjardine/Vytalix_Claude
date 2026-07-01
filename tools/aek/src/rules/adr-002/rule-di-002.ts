import type { AnalysisContext } from '../../core/analysis-context';
import type { AEKRule, RuleResult } from '../../core/types';

export const ruleDi002: AEKRule = {
  id: 'RULE-DI-002',
  adr: 'ADR-002',
  description: 'Dental bounded context must not import core or longevity bounded contexts.',
  evaluate(context: AnalysisContext): RuleResult {
    const findings = context.dependencyGraph.edges
      .filter((edge) => edge.from.startsWith('src/dental/'))
      .filter((edge) => edge.to.startsWith('src/core/') || edge.to.startsWith('src/longevity/'))
      .map((edge) => ({
        ruleId: this.id,
        adr: this.adr,
        severity: 'error' as const,
        message: 'Dental bounded context imports a forbidden upstream/supporting bounded context.',
        from: edge.from,
        to: edge.to,
      }));

    return { ruleId: this.id, findings };
  },
};

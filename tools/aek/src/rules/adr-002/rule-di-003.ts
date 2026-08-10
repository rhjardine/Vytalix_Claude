import type { AnalysisContext } from '../../core/analysis-context';
import type { AEKRule, RuleResult } from '../../core/types';

export const ruleDi003: AEKRule = {
  id: 'RULE-DI-003',
  adr: 'ADR-002',
  description: 'Core and longevity bounded contexts must not import dental internals.',
  evaluate(context: AnalysisContext): RuleResult {
    const findings = context.dependencyGraph.edges
      .filter((edge) => edge.from.startsWith('src/core/') || edge.from.startsWith('src/longevity/'))
      .filter((edge) => edge.to.startsWith('src/dental/'))
      .map((edge) => ({
        ruleId: this.id,
        adr: this.adr,
        severity: 'error' as const,
        message: 'Core or longevity bounded context imports dental internals.',
        from: edge.from,
        to: edge.to,
      }));

    return { ruleId: this.id, findings };
  },
};

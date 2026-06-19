import type { AnalysisContext } from '../../core/analysis-context';
import type { AEKRule, RuleResult } from '../../core/types';

const DENTAL_PREFIX = 'src/dental/';

function isDentalBarrel(filePath: string): boolean {
  return filePath === 'src/dental.ts' || filePath === 'src/dental/index.ts' || filePath === 'src/dental/index.tsx';
}

export const ruleDi001: AEKRule = {
  id: 'RULE-DI-001',
  adr: 'ADR-002',
  description: 'External modules must use approved dental barrel exports instead of importing dental internals directly.',
  evaluate(context: AnalysisContext): RuleResult {
    const findings = context.dependencyGraph.edges
      .filter((edge) => !edge.from.startsWith(DENTAL_PREFIX))
      .filter((edge) => edge.to.startsWith(DENTAL_PREFIX))
      .filter((edge) => !isDentalBarrel(edge.to))
      .map((edge) => ({
        ruleId: this.id,
        adr: this.adr,
        severity: 'error' as const,
        message: 'External module imports dental internals directly; use the approved dental barrel export.',
        from: edge.from,
        to: edge.to,
      }));

    return { ruleId: this.id, findings };
  },
};

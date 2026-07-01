import type { AnalysisContext } from '../../core/analysis-context';
import type { AEKRule, RuleResult } from '../../core/types';

const DENTAL_PREFIX = 'src/dental/';
const COMPOSITION_ROOT = 'src/server.ts';
const DENTAL_ROUTER_PREFIX = 'src/dental/routers/';

function isDentalBarrel(filePath: string): boolean {
  return filePath === 'src/dental.ts' || filePath === 'src/dental/index.ts' || filePath === 'src/dental/index.tsx';
}

// Composition Root exemption: src/server.ts is the application's composition
// root and is permitted to import dental HTTP router modules directly to mount
// them. This does NOT extend to handlers or to dental domain logic, which must
// still consume the barrel. See ADR-002 / Domain-Boundaries.md.
function isCompositionRootRouterMount(from: string, to: string): boolean {
  return from === COMPOSITION_ROOT && to.startsWith(DENTAL_ROUTER_PREFIX) && to.endsWith('.router.ts');
}

export const ruleDi001: AEKRule = {
  id: 'RULE-DI-001',
  adr: 'ADR-002',
  description: 'External modules must use approved dental barrel exports instead of importing dental internals directly. The composition root (src/server.ts) may import dental HTTP routers directly.',
  evaluate(context: AnalysisContext): RuleResult {
    const findings = context.dependencyGraph.edges
      .filter((edge) => !edge.from.startsWith(DENTAL_PREFIX))
      .filter((edge) => edge.to.startsWith(DENTAL_PREFIX))
      .filter((edge) => !isDentalBarrel(edge.to))
      .filter((edge) => !isCompositionRootRouterMount(edge.from, edge.to))
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

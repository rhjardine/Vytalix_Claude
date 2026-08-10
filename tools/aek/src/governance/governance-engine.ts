// =============================================================================
// governance-engine.ts — AEK v1.1 Governance rule orchestration
//
// Runs the independent WARNING-only governance rules and aggregates their
// findings. Mirrors the shape of core/rule-engine.ts but is entirely separate
// from the ADR-002 RuleEngine, so RULE-DI-001/002/003 are untouched and the
// baseline policy gate is unaffected.
// =============================================================================

import type { GovernanceContext, GovernanceFinding, GovernanceRule } from './governance-types';
import { ruleIso001 } from './rules/rule-iso-001';
import { ruleHyg001 } from './rules/rule-hyg-001';
import { ruleDoc001 } from './rules/rule-doc-001';
import { ruleAdr001 } from './rules/rule-adr-001';

export const GOVERNANCE_RULES: readonly GovernanceRule[] = [ruleIso001, ruleHyg001, ruleDoc001, ruleAdr001];

export interface GovernanceReportSection {
  rules: Array<Pick<GovernanceRule, 'id' | 'category' | 'description'>>;
  findings: GovernanceFinding[];
}

export class GovernanceEngine {
  constructor(private readonly rules: readonly GovernanceRule[] = GOVERNANCE_RULES) {}

  evaluate(context: GovernanceContext): GovernanceReportSection {
    const findings = this.rules.flatMap((rule) => rule.evaluate(context).findings);
    return {
      rules: this.rules.map(({ id, category, description }) => ({ id, category, description })),
      findings,
    };
  }
}

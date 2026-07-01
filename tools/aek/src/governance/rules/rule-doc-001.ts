// =============================================================================
// rule-doc-001.ts — RULE-DOC-001 · Mandatory Governance Documents (WARNING)
//
// Verifies the canonical governance document set exists. WARNING-only.
// Read-only: never creates or edits documents.
// =============================================================================

import type { GovernanceContext, GovernanceRule, GovernanceRuleResult, GovernanceFinding } from '../governance-types';

export const ruleDoc001: GovernanceRule = {
  id: 'RULE-DOC-001',
  category: 'documentation',
  description:
    'The canonical governance documents (docs/governance/* and docs/REPOSITORY_MANIFEST.md, docs/REPOSITORY_TOPOLOGY.md) must be present.',
  evaluate(context: GovernanceContext): GovernanceRuleResult {
    const findings: GovernanceFinding[] = Object.entries(context.snapshot.governanceDocs)
      .filter(([, exists]) => !exists)
      .map(([docPath]) => ({
        ruleId: this.id,
        category: this.category,
        severity: 'warning' as const,
        message: `Mandatory governance document is missing: '${docPath}'.`,
        target: docPath,
      }));

    return { ruleId: this.id, findings };
  },
};

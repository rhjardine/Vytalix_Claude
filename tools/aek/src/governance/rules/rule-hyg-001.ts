// =============================================================================
// rule-hyg-001.ts — RULE-HYG-001 · Repository Hygiene (WARNING)
//
// Detects loose developer/scratch artifacts at the repository root that do not
// belong to any domain zone. WARNING-only; reports, never blocks.
// Does not delete or move anything (read-only governance).
// =============================================================================

import type { GovernanceContext, GovernanceRule, GovernanceRuleResult, GovernanceFinding } from '../governance-types';

// Patterns that should not live at the repository root.
const DISALLOWED_ROOT_PATTERNS: ReadonlyArray<{ test: RegExp; reason: string }> = [
  { test: /^debug.*\.(ts|js|json)$/i, reason: 'debug scratch file' },
  { test: /^refactor.*\.(ts|js)$/i, reason: 'refactor scratch script' },
  { test: /^fix-imports.*\.(ts|js)$/i, reason: 'one-off codemod script' },
  { test: /\.diff$/i, reason: 'diff artifact' },
  { test: /^diff.*\.txt$/i, reason: 'diff dump' },
  { test: /^payload\.json$/i, reason: 'request payload scratch file' },
  { test: /\.page\.tsx$/i, reason: 'stray page component at root' },
  { test: /^New_files.*$/i, reason: 'unclassified file list' },
];

export const ruleHyg001: GovernanceRule = {
  id: 'RULE-HYG-001',
  category: 'repositoryHygiene',
  description:
    'The repository root must not contain loose developer/scratch artifacts (debug_*, refactor*, fix-imports*, *.diff, payload.json, *.page.tsx, etc.).',
  evaluate(context: GovernanceContext): GovernanceRuleResult {
    const findings: GovernanceFinding[] = [];

    for (const fileName of context.snapshot.rootFiles) {
      const match = DISALLOWED_ROOT_PATTERNS.find((pattern) => pattern.test.test(fileName));
      if (match) {
        findings.push({
          ruleId: this.id,
          category: this.category,
          severity: 'warning',
          message: `Loose artifact at repository root: '${fileName}' (${match.reason}). Should be relocated, removed, or ignored.`,
          target: fileName,
        });
      }
    }

    return { ruleId: this.id, findings };
  },
};

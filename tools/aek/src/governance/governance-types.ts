// =============================================================================
// governance-types.ts — AEK v1.1 Governance Layer (independent of ADR-002 rules)
//
// The governance layer is ADDITIVE and SEPARATE from the ADR-002 dependency
// rules (RULE-DI-001/002/003). Its findings are WARNING-only and are NEVER
// counted by the baseline policy gate, so they cannot change the AEK exit code.
//
// This file defines the contracts only. No rule logic lives here.
// =============================================================================

import type { DependencyGraph } from '../analyzers/dependency-graph/graph-types';

/** Governance findings are advisory; never 'error' in v1.1. */
export type GovernanceSeverity = 'warning' | 'info';

/** Health dimensions surfaced in the enriched report. */
export type HealthDimension =
  | 'architecture'
  | 'repository'
  | 'governance'
  | 'documentation'
  | 'experimentalIsolation'
  | 'repositoryHygiene';

export interface GovernanceFinding {
  ruleId: string;
  category: HealthDimension;
  severity: GovernanceSeverity;
  message: string;
  /** Repo-relative path or logical target the finding refers to. */
  target: string;
}

export interface GovernanceRuleResult {
  ruleId: string;
  findings: GovernanceFinding[];
}

/**
 * Snapshot of repository structure used by filesystem-oriented governance
 * rules. Built once by the RepositoryScanner and shared across rules.
 */
export interface AdrFolderInfo {
  folder: string;          // e.g. "ADR-001 Arquitectura Hexagonal"
  docFile: string | null;  // e.g. "ADR-001.md" or null if missing
  hasStatus: boolean;      // doc declares an "Estado"/"Status"
  title: string | null;    // first H1 title inside the doc
}

export interface RepositorySnapshot {
  /** File names (not directories) directly at the repository root. */
  rootFiles: string[];
  /** Mandatory governance document paths → existence. */
  governanceDocs: Record<string, boolean>;
  /** ADR folder integrity data. */
  adrFolders: AdrFolderInfo[];
}

export interface GovernanceContext {
  repositoryRoot: string;
  dependencyGraph: DependencyGraph;
  snapshot: RepositorySnapshot;
}

export interface GovernanceRule {
  id: string;
  category: HealthDimension;
  description: string;
  evaluate(context: GovernanceContext): GovernanceRuleResult;
}

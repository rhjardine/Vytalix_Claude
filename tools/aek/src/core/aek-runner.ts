// =============================================================================
// aek-runner.ts — AEK v3.0 shared execution flow
//
// Single, side-effect-free orchestration used by ALL entrypoints so that CLI
// logic is never duplicated (cli/index.ts and cli/ci-check.ts both call this).
//
// Responsibilities:
//   1. resolve paths
//   2. run analyzer  (unchanged)
//   3. run rule engine (unchanged)
//   4. build the report object (NOT written here — callers decide)
//   5. validate baseline via schema + select policy via registry
//   6. evaluate policy
//
// This function performs NO file writes. The only filesystem read is the
// baseline config (same read v2.2 performed in the CLI). Writing report.json
// remains the caller's responsibility, which keeps ci-check.ts write-free.
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { DependencyGraphBuilder } from '../analyzers/dependency-graph/dependency-graph-builder';
import { AnalysisContext } from './analysis-context';
import { RuleEngine, type RuleEngineResult } from './rule-engine';
import type { JsonReport } from '../reporters/json-reporter';
import { parseBaseline } from '../policy/baseline-schema';
import { selectPolicy } from '../policy/registry/policy-registry';
import type { PolicyResult } from '../policy/aek-policy-engine';
import { ruleDi001 } from '../rules/adr-002/rule-di-001';
import { ruleDi002 } from '../rules/adr-002/rule-di-002';
import { ruleDi003 } from '../rules/adr-002/rule-di-003';
// AEK v1.1 — independent governance layer (additive, WARNING-only)
import { RepositoryScanner } from '../governance/analyzers/repository-scanner';
import { GovernanceEngine } from '../governance/governance-engine';
import { buildHealthReport } from '../governance/health-report';

export interface AekRunOptions {
  root?: string;
  out?: string;
  baseline?: string;
}

export interface AekRunResult {
  repositoryRoot: string;
  reportPath: string;
  report: JsonReport;
  engineResult: RuleEngineResult;
  policy: PolicyResult;
}

export function findRepositoryRoot(startDirectory: string): string {
  let current = path.resolve(startDirectory);
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return path.resolve(startDirectory);
}

export async function runAek(options: AekRunOptions): Promise<AekRunResult> {
  const repositoryRoot = options.root ? path.resolve(options.root) : findRepositoryRoot(process.cwd());
  const reportPath = options.out ? path.resolve(options.out) : path.join(repositoryRoot, '.aek', 'report.json');
  const baselinePath = options.baseline ? path.resolve(options.baseline) : path.join(repositoryRoot, '.aek', 'baseline.json');

  // 1. Analyzer layer (unchanged)
  const dependencyGraph = await new DependencyGraphBuilder(repositoryRoot).build();

  // 2. Rules layer — ADR-002 (unchanged)
  const context = new AnalysisContext(repositoryRoot, dependencyGraph);
  const engineResult = new RuleEngine([ruleDi001, ruleDi002, ruleDi003]).evaluate(context);

  // 2b. Governance layer — AEK v1.1 (independent, WARNING-only).
  //     Runs separately from the ADR-002 RuleEngine and is NEVER read by the
  //     policy gate, so it cannot affect PASS/FAIL or the exit code.
  const snapshot = new RepositoryScanner(repositoryRoot).scan();
  const governance = new GovernanceEngine().evaluate({ repositoryRoot, dependencyGraph, snapshot });
  const health = buildHealthReport(engineResult.findings.length, governance.findings);

  const report: JsonReport = {
    timestamp: new Date().toISOString(),
    rules: engineResult.rules,
    findings: engineResult.findings,
    governance,
    health,
  };

  // 3. Policy layer — validate baseline (schema) + select strategy (registry).
  //    NOTE: evaluates engineResult (ADR-002 findings) ONLY. Governance
  //    findings are intentionally excluded from the gate.
  const baseline = parseBaseline(JSON.parse(fs.readFileSync(baselinePath, 'utf8')));
  const policy = selectPolicy(baseline.mode).evaluate(engineResult, baseline);

  return { repositoryRoot, reportPath, report, engineResult, policy };
}

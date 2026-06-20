#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import { DependencyGraphBuilder } from '../analyzers/dependency-graph/dependency-graph-builder';
import { AnalysisContext } from '../core/analysis-context';
import { RuleEngine } from '../core/rule-engine';
import { JsonReporter } from '../reporters/json-reporter';
import { AEKPolicyEngine, type AEKBaselineConfig } from '../policy/aek-policy-engine';
import { ruleDi001 } from '../rules/adr-002/rule-di-001';
import { ruleDi002 } from '../rules/adr-002/rule-di-002';
import { ruleDi003 } from '../rules/adr-002/rule-di-003';

function findRepositoryRoot(startDirectory: string): string {
  let current = path.resolve(startDirectory);
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return path.resolve(startDirectory);
}

async function main(): Promise<void> {
  const program = new Command()
    .name('aek')
    .description('Run AEK static architecture analysis and baseline gate.')
    .option('--root <path>', 'repository root to analyze')
    .option('--out <path>', 'JSON report output path')
    .option('--baseline <path>', 'baseline file path');

  program.parse(process.argv);
  const options = program.opts() as { root?: string; out?: string; baseline?: string };
  const repositoryRoot = options.root ? path.resolve(options.root) : findRepositoryRoot(process.cwd());
  const reportPath = options.out ? path.resolve(options.out) : path.join(repositoryRoot, '.aek', 'report.json');
  const baselinePath = options.baseline ? path.resolve(options.baseline) : path.join(repositoryRoot, '.aek', 'baseline.json');

  // 1. Analyzer layer
  const dependencyGraph = await new DependencyGraphBuilder(repositoryRoot).build();

  // 2. Rules layer (ADR-002)
  const context = new AnalysisContext(repositoryRoot, dependencyGraph);
  const engineResult = new RuleEngine([ruleDi001, ruleDi002, ruleDi003]).evaluate(context);

  new JsonReporter().write(reportPath, {
    timestamp: new Date().toISOString(),
    rules: engineResult.rules,
    findings: engineResult.findings,
  });

  process.stdout.write(`AEK analysis complete. Report written to ${path.relative(process.cwd(), reportPath)}\n`);

  // 3. Policy layer
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as AEKBaselineConfig;
  const policy = new AEKPolicyEngine().evaluate(engineResult, baseline);

  // 4. Result
  process.stdout.write(`${policy.reason}\n`);
  process.exitCode = policy.exitCode;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`AEK analysis failed: ${message}\n`);
  process.exitCode = 1;
});

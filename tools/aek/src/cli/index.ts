#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import { DependencyGraphBuilder } from '../analyzers/dependency-graph/dependency-graph-builder';
import { AnalysisContext } from '../core/analysis-context';
import { RuleEngine } from '../core/rule-engine';
import { JsonReporter } from '../reporters/json-reporter';
import { checkBaseline } from '../core/baseline-checker';
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
  const baselinePath = options.baseline ? path.resolve(options.baseline) : undefined;

  // 1. dependency analysis
  const dependencyGraph = await new DependencyGraphBuilder(repositoryRoot).build();

  // 2. rule engine (ADR-002)
  const context = new AnalysisContext(repositoryRoot, dependencyGraph);
  const engineResult = new RuleEngine([ruleDi001, ruleDi002, ruleDi003]).evaluate(context);

  new JsonReporter().write(reportPath, {
    timestamp: new Date().toISOString(),
    rules: engineResult.rules,
    findings: engineResult.findings,
  });

  process.stdout.write(`AEK analysis complete. Report written to ${path.relative(process.cwd(), reportPath)}\n`);

  // 3. baseline check (.aek/baseline.json)
  const result = checkBaseline(repositoryRoot, reportPath, baselinePath);
  process.stdout.write(`AEK Baseline Check — ${result.status}\n`);
  process.stdout.write(`  actual findings : ${result.actual}\n`);
  process.stdout.write(`  expected (max)  : ${result.expected}\n`);

  // 4. final exit code
  process.exitCode = result.status === 'PASS' ? 0 : 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`AEK analysis failed: ${message}\n`);
  process.exitCode = 1;
});

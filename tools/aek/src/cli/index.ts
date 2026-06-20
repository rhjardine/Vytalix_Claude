#!/usr/bin/env node
import path from 'node:path';
import { Command } from 'commander';
import { JsonReporter } from '../reporters/json-reporter';
import { runAek } from '../core/aek-runner';

async function main(): Promise<void> {
  const program = new Command()
    .name('aek')
    .description('Run AEK static architecture analysis and baseline gate.')
    .option('--root <path>', 'repository root to analyze')
    .option('--out <path>', 'JSON report output path')
    .option('--baseline <path>', 'baseline file path');

  program.parse(process.argv);
  const options = program.opts() as { root?: string; out?: string; baseline?: string };

  // CLI orchestrates only: run shared flow (analyzer -> rules -> policy),
  // then write the report and emit the policy decision. No decision logic here.
  const { reportPath, report, policy } = await runAek(options);

  new JsonReporter().write(reportPath, report);
  process.stdout.write(`AEK analysis complete. Report written to ${path.relative(process.cwd(), reportPath)}\n`);

  process.stdout.write(`${policy.reason}\n`);
  process.exitCode = policy.exitCode;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`AEK analysis failed: ${message}\n`);
  process.exitCode = 1;
});

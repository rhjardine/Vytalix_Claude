#!/usr/bin/env node
// =============================================================================
// ci-check.ts — AEK v3.0 CI Readiness Hook (DRY RUN ONLY)
//
// Purpose: prepare future GitHub Actions integration.
//   - Executes the SAME shared AEK flow as cli/index.ts (no duplicated logic).
//   - Emits the policy decision and returns the policy exit code.
//   - Writes NO files and modifies NO repository state (report is never saved).
// =============================================================================
import { Command } from 'commander';
import { runAek } from '../core/aek-runner';

async function main(): Promise<void> {
  const program = new Command()
    .name('aek-ci-check')
    .description('AEK CI readiness gate — dry run, writes nothing.')
    .option('--root <path>', 'repository root to analyze')
    .option('--baseline <path>', 'baseline file path');

  program.parse(process.argv);
  const options = program.opts() as { root?: string; baseline?: string };

  // Same flow as index.ts; the report object is computed but intentionally
  // NOT written — this gate is read-only.
  const { policy, report } = await runAek({ root: options.root, baseline: options.baseline });

  process.stdout.write(`${policy.reason}\n`);

  // Advisory governance health summary (AEK v1.1). Never affects exit code.
  if (report.health) {
    const warnings = report.governance?.findings.length ?? 0;
    process.stdout.write(
      `AEK Governance Health (advisory) — overall ${report.health.overall.score}/100 (${report.health.overall.status}); ${warnings} warning(s)\n`,
    );
  }

  process.exitCode = policy.exitCode;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`AEK CI check failed: ${message}\n`);
  process.exitCode = 1;
});

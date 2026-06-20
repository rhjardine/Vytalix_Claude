#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { checkBaseline } from '../core/baseline-checker';

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

const repositoryRoot = findRepositoryRoot(process.cwd());

try {
  const result = checkBaseline(repositoryRoot);
  process.stdout.write(`AEK Baseline Check — ${result.status}\n`);
  process.stdout.write(`  actual findings : ${result.actual}\n`);
  process.stdout.write(`  expected (max)  : ${result.expected}\n`);
  process.exitCode = result.status === 'PASS' ? 0 : 1;
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`AEK baseline check failed: ${message}\n`);
  process.exitCode = 1;
}

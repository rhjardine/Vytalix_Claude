import fs from 'node:fs';
import path from 'node:path';
import type { AEKFinding, AEKRule } from '../core/types';

export interface JsonReport {
  timestamp: string;
  rules: Array<Pick<AEKRule, 'id' | 'adr' | 'description'>>;
  findings: AEKFinding[];
}

export class JsonReporter {
  write(reportPath: string, report: JsonReport): void {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
}

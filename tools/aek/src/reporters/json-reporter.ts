import fs from 'node:fs';
import path from 'node:path';
import type { AEKFinding, AEKRule } from '../core/types';
import type { GovernanceReportSection } from '../governance/governance-engine';
import type { HealthReport } from '../governance/health-report';

export interface JsonReport {
  timestamp: string;
  rules: Array<Pick<AEKRule, 'id' | 'adr' | 'description'>>;
  findings: AEKFinding[];
  // ── AEK v1.1 additive governance layer (advisory, WARNING-only) ──
  // Optional so existing consumers (which read `rules`/`findings`) are
  // unaffected. The baseline policy gate never reads these fields.
  governance?: GovernanceReportSection;
  health?: HealthReport;
}

export class JsonReporter {
  write(reportPath: string, report: JsonReport): void {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
}

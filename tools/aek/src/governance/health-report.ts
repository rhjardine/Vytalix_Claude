// =============================================================================
// health-report.ts — AEK v1.1 Health scoring
//
// Computes repository health dimensions from:
//   - the ADR-002 architecture findings (errors) — read-only, not modified
//   - the WARNING-only governance findings (RULE-ISO/HYG/DOC/ADR)
//
// Pure function. No I/O. Scores are advisory and never affect the exit code.
// =============================================================================

import type { GovernanceFinding, HealthDimension } from './governance-types';

export type HealthStatus = 'HEALTHY' | 'OBSERVE' | 'AT_RISK';

export interface DimensionHealth {
  score: number; // 0–100
  status: HealthStatus;
  findings: number;
}

export interface HealthReport {
  dimensions: Record<HealthDimension, DimensionHealth>;
  overall: { score: number; status: HealthStatus };
}

const WARNING_PENALTY = 8;        // per governance warning
const ARCHITECTURE_PENALTY = 100; // any ADR-002 error is critical

// Weighted contribution of each dimension to the overall score (sums to 1.0).
const WEIGHTS: Record<HealthDimension, number> = {
  architecture: 0.4,
  governance: 0.15,
  experimentalIsolation: 0.15,
  documentation: 0.1,
  repositoryHygiene: 0.1,
  repository: 0.1,
};

function statusFor(score: number): HealthStatus {
  if (score >= 90) return 'HEALTHY';
  if (score >= 70) return 'OBSERVE';
  return 'AT_RISK';
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function dimension(findings: number, penalty: number = WARNING_PENALTY): DimensionHealth {
  const score = clampScore(100 - findings * penalty);
  return { score, status: statusFor(score), findings };
}

export function buildHealthReport(
  architectureErrorCount: number,
  governanceFindings: GovernanceFinding[],
): HealthReport {
  const countOf = (category: HealthDimension): number =>
    governanceFindings.filter((finding) => finding.category === category).length;

  const isolation = countOf('experimentalIsolation');
  const hygiene = countOf('repositoryHygiene');
  const documentation = countOf('documentation');
  const governance = countOf('governance');

  const dimensions: Record<HealthDimension, DimensionHealth> = {
    architecture: dimension(architectureErrorCount, ARCHITECTURE_PENALTY),
    experimentalIsolation: dimension(isolation),
    repositoryHygiene: dimension(hygiene),
    documentation: dimension(documentation),
    governance: dimension(governance),
    // Repository structural health = combined isolation + hygiene signal.
    repository: dimension(isolation + hygiene),
  };

  const overallScore = clampScore(
    (Object.keys(WEIGHTS) as HealthDimension[]).reduce(
      (sum, dim) => sum + dimensions[dim].score * WEIGHTS[dim],
      0,
    ),
  );

  return {
    dimensions,
    overall: { score: overallScore, status: statusFor(overallScore) },
  };
}

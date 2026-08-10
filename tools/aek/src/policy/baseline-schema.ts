// =============================================================================
// baseline-schema.ts — AEK v3.0 Baseline Schema Hardening
//
// Lightweight structural validation for .aek/baseline.json.
// NO external libraries (no zod) — hand-rolled, deterministic, dependency-free.
// =============================================================================

export interface Baseline {
  expectedFindings: number;
  // Optional future field. Reserved for the Policy Registry (v3.0 scaffolding).
  // Unused by the active DEFAULT policy; declared for forward compatibility.
  mode?: string;
}

/**
 * Validate and normalize a parsed baseline object.
 * Throws a descriptive Error on any violation. Returns a typed Baseline.
 *
 * Rules (minimal, per AEK v3.0):
 *   - expectedFindings: number, finite, >= 0
 *   - mode: string when present (optional)
 */
export function parseBaseline(input: unknown): Baseline {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('baseline.json must be a JSON object');
  }

  const record = input as Record<string, unknown>;
  const { expectedFindings, mode } = record;

  if (
    typeof expectedFindings !== 'number' ||
    !Number.isFinite(expectedFindings) ||
    expectedFindings < 0
  ) {
    throw new Error('baseline.expectedFindings must be a finite number >= 0');
  }

  if (mode !== undefined && typeof mode !== 'string') {
    throw new Error('baseline.mode must be a string when present');
  }

  return mode === undefined ? { expectedFindings } : { expectedFindings, mode };
}

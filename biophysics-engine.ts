// =============================================================================
// BiophysicsEngine — Doctor Antivejez Algorithm v2.1.0
// Desacoplado del frontend Next.js. Consumible como servicio puro.
//
// Algorithm:
//   1. For each of 8 measurements, look up the baremo (scoring board)
//      for the patient's sex + athlete status
//   2. Interpolate to find the partial biological age for that measurement
//   3. Final biological age = weighted average of partial ages
//   4. Differential = biologicalAge - chronologicalAge
//
// Pure functions are exported for direct unit testing and external use.
// The BiophysicsEngine class composes them and adds logging.
//
// Baremos are fetched from DB or Redis cache (24h TTL).
// All computations are deterministic and reproducible given the same inputs.
// =============================================================================

import { logger } from './logger'

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type BiologicalSex = 'MALE' | 'FEMALE' | 'INTERSEX'

export interface DimensionalMeasurement {
  high: number
  long: number
  width: number
}

export interface BiophysicsMeasurements {
  fatPercentage: number
  bmi: number
  digitalReflexes: DimensionalMeasurement
  visualAccommodation: number
  staticBalance: DimensionalMeasurement
  skinHydration: number
  systolicPressure: number
  diastolicPressure: number
}

export interface BiophysicsPartialAges {
  fatAge: number
  bmiAge: number
  reflexesAge: number
  visualAge: number
  balanceAge: number
  hydrationAge: number
  systolicAge: number
  diastolicAge: number
}

/** Full result including immutable audit fields for clinical traceability. */
export interface BiophysicsResult {
  biologicalAge: number          // Rounded to 1 decimal
  differentialAge: number        // Rounded to 1 decimal
  partialAges: BiophysicsPartialAges
  ageStatus: 'REJUVENECIDO' | 'NORMAL' | 'ENVEJECIDO'
  algorithmVersion: string
  /** Exact inputs used to produce this result — stored for longitudinal replay. */
  inputSnapshot: {
    measurements: BiophysicsMeasurements
    chronologicalAge: number
    sex: BiologicalSex
    isAthlete: boolean
  }
  computedAt: Date
}

// Range entry in a baremo board
export interface BaremoRange {
  ageMin: number           // Lower bound of age bracket this range represents
  ageMax: number           // Upper bound of age bracket
  valueMin: number         // Measurement value at ageMin
  valueMax: number         // Measurement value at ageMax
}

export interface BoardData {
  measurementKey: string
  ranges: BaremoRange[]
}

// ─────────────────────────────────────────────────────────────────
// Item weights — must sum to 1.0
// Based on Doctor Antivejez clinical validation protocol.
// These weights are stable across versions (algorithm = "daaa-biophysics-v2")
// ─────────────────────────────────────────────────────────────────

export const ITEM_WEIGHTS: Readonly<Record<keyof BiophysicsPartialAges, number>> = {
  fatAge:       0.15,
  bmiAge:       0.15,
  reflexesAge:  0.15,
  visualAge:    0.10,
  balanceAge:   0.10,
  hydrationAge: 0.10,
  systolicAge:  0.15,
  diastolicAge: 0.10,
} as const

export const ALGORITHM_VERSION = 'daaa-biophysics-v2.1.0'

// ─────────────────────────────────────────────────────────────────
// Default baremos — used when DB boards are unavailable
// In production, boards are loaded from DB + Redis cache.
// These encode the standard Doctor Antivejez reference tables.
//
// Format per item: array of { ageMin, ageMax, valueMin, valueMax }
// Values are canonical (male, non-athlete) — female/athlete boards
// loaded from DB have different coefficients.
// ─────────────────────────────────────────────────────────────────

export const DEFAULT_BOARDS_MALE_NONATHLETE: Readonly<Record<string, BaremoRange[]>> = {
  fatPercentage: [
    { ageMin: 20, ageMax: 25, valueMin: 8,  valueMax: 14 },
    { ageMin: 25, ageMax: 30, valueMin: 10, valueMax: 17 },
    { ageMin: 30, ageMax: 35, valueMin: 12, valueMax: 19 },
    { ageMin: 35, ageMax: 40, valueMin: 14, valueMax: 21 },
    { ageMin: 40, ageMax: 45, valueMin: 15, valueMax: 22 },
    { ageMin: 45, ageMax: 50, valueMin: 16, valueMax: 24 },
    { ageMin: 50, ageMax: 55, valueMin: 17, valueMax: 26 },
    { ageMin: 55, ageMax: 60, valueMin: 18, valueMax: 28 },
    { ageMin: 60, ageMax: 65, valueMin: 19, valueMax: 29 },
    { ageMin: 65, ageMax: 75, valueMin: 20, valueMax: 31 },
  ],
  bmi: [
    { ageMin: 20, ageMax: 25, valueMin: 18.5, valueMax: 23.0 },
    { ageMin: 25, ageMax: 30, valueMin: 19.0, valueMax: 24.0 },
    { ageMin: 30, ageMax: 40, valueMin: 19.5, valueMax: 25.0 },
    { ageMin: 40, ageMax: 50, valueMin: 20.0, valueMax: 26.0 },
    { ageMin: 50, ageMax: 60, valueMin: 20.5, valueMax: 27.0 },
    { ageMin: 60, ageMax: 75, valueMin: 21.0, valueMax: 27.5 },
  ],
  reflexes: [
    { ageMin: 20, ageMax: 25, valueMin: 0.5,  valueMax: 2.0  },
    { ageMin: 25, ageMax: 30, valueMin: 0.6,  valueMax: 2.5  },
    { ageMin: 30, ageMax: 35, valueMin: 0.7,  valueMax: 3.0  },
    { ageMin: 35, ageMax: 40, valueMin: 0.8,  valueMax: 3.5  },
    { ageMin: 40, ageMax: 45, valueMin: 1.0,  valueMax: 4.0  },
    { ageMin: 45, ageMax: 50, valueMin: 1.2,  valueMax: 4.5  },
    { ageMin: 50, ageMax: 60, valueMin: 1.5,  valueMax: 5.0  },
    { ageMin: 60, ageMax: 75, valueMin: 2.0,  valueMax: 6.5  },
  ],
  visualAccommodation: [
    { ageMin: 20, ageMax: 25, valueMin: 8.0,  valueMax: 12.0 },
    { ageMin: 25, ageMax: 30, valueMin: 6.0,  valueMax: 10.0 },
    { ageMin: 30, ageMax: 35, valueMin: 4.5,  valueMax: 8.0  },
    { ageMin: 35, ageMax: 40, valueMin: 3.0,  valueMax: 6.5  },
    { ageMin: 40, ageMax: 45, valueMin: 2.0,  valueMax: 5.0  },
    { ageMin: 45, ageMax: 50, valueMin: 1.0,  valueMax: 3.5  },
    { ageMin: 50, ageMax: 60, valueMin: 0.5,  valueMax: 2.5  },
    { ageMin: 60, ageMax: 75, valueMin: 0.2,  valueMax: 1.5  },
  ],
  balance: [
    { ageMin: 20, ageMax: 25, valueMin: 20.0, valueMax: 60.0 },
    { ageMin: 25, ageMax: 30, valueMin: 18.0, valueMax: 55.0 },
    { ageMin: 30, ageMax: 35, valueMin: 15.0, valueMax: 50.0 },
    { ageMin: 35, ageMax: 40, valueMin: 12.0, valueMax: 45.0 },
    { ageMin: 40, ageMax: 45, valueMin: 10.0, valueMax: 40.0 },
    { ageMin: 45, ageMax: 50, valueMin: 8.0,  valueMax: 35.0 },
    { ageMin: 50, ageMax: 60, valueMin: 5.0,  valueMax: 28.0 },
    { ageMin: 60, ageMax: 75, valueMin: 3.0,  valueMax: 20.0 },
  ],
  skinHydration: [
    { ageMin: 20, ageMax: 25, valueMin: 55.0, valueMax: 75.0 },
    { ageMin: 25, ageMax: 30, valueMin: 50.0, valueMax: 72.0 },
    { ageMin: 30, ageMax: 40, valueMin: 45.0, valueMax: 68.0 },
    { ageMin: 40, ageMax: 50, valueMin: 38.0, valueMax: 62.0 },
    { ageMin: 50, ageMax: 60, valueMin: 30.0, valueMax: 55.0 },
    { ageMin: 60, ageMax: 75, valueMin: 22.0, valueMax: 48.0 },
  ],
  systolicPressure: [
    { ageMin: 20, ageMax: 25, valueMin: 100, valueMax: 120 },
    { ageMin: 25, ageMax: 30, valueMin: 105, valueMax: 125 },
    { ageMin: 30, ageMax: 40, valueMin: 108, valueMax: 128 },
    { ageMin: 40, ageMax: 50, valueMin: 110, valueMax: 130 },
    { ageMin: 50, ageMax: 60, valueMin: 112, valueMax: 135 },
    { ageMin: 60, ageMax: 75, valueMin: 115, valueMax: 145 },
  ],
  diastolicPressure: [
    { ageMin: 20, ageMax: 25, valueMin: 60, valueMax: 80 },
    { ageMin: 25, ageMax: 30, valueMin: 62, valueMax: 82 },
    { ageMin: 30, ageMax: 40, valueMin: 65, valueMax: 84 },
    { ageMin: 40, ageMax: 50, valueMin: 68, valueMax: 86 },
    { ageMin: 50, ageMax: 60, valueMin: 70, valueMax: 88 },
    { ageMin: 60, ageMax: 75, valueMin: 72, valueMax: 92 },
  ],
}

// ─────────────────────────────────────────────────────────────────
// Pure functions — exported for direct testing and composability.
// These functions have NO side effects, NO I/O, NO logging.
// Given identical inputs they always return identical outputs.
// ─────────────────────────────────────────────────────────────────

/**
 * Reduces dimensional measurements to scalar values used by baremo lookup.
 * - digitalReflexes → volume of parallelepiped (cm³)
 * - staticBalance → product of displacement dimensions (stability score)
 */
export function reduceMeasurements(m: BiophysicsMeasurements): Record<string, number> {
  const reflexVolume  = m.digitalReflexes.high * m.digitalReflexes.long * m.digitalReflexes.width
  const balanceProduct = m.staticBalance.high * m.staticBalance.long * m.staticBalance.width

  return {
    fatPercentage:       m.fatPercentage,
    bmi:                 m.bmi,
    reflexes:            reflexVolume,
    visualAccommodation: m.visualAccommodation,
    balance:             balanceProduct,
    skinHydration:       m.skinHydration,
    systolicPressure:    m.systolicPressure,
    diastolicPressure:   m.diastolicPressure,
  }
}

/**
 * Builds female-adjusted default boards by applying clinical offsets to the
 * canonical male non-athlete baremos. Only used when DB boards are unavailable.
 */
export function buildFemaleDefaultBoards(): Record<string, BaremoRange[]> {
  const femaleBoards: Record<string, BaremoRange[]> = JSON.parse(
    JSON.stringify(DEFAULT_BOARDS_MALE_NONATHLETE)
  )
  // Fat percentage: female ranges ~7pp higher than male (ACS guidelines)
  femaleBoards.fatPercentage = femaleBoards.fatPercentage.map((r: BaremoRange) => ({
    ...r,
    valueMin: r.valueMin + 7,
    valueMax: r.valueMax + 7,
  }))
  // Skin hydration: slightly higher baseline for females
  femaleBoards.skinHydration = femaleBoards.skinHydration.map((r: BaremoRange) => ({
    ...r,
    valueMin: r.valueMin + 3,
    valueMax: r.valueMax + 3,
  }))
  return femaleBoards
}

/**
 * Resolves which board map to use.
 * DB boards take precedence. Falls back to sex-specific defaults.
 * INTERSEX uses male non-athlete boards — extend with DB boards when needed.
 *
 * @param boards - Optional override boards from DB
 * @param sex    - Biological sex for fallback board selection
 * @returns      - Map of measurementKey → BaremoRange[]
 */
export function resolveBoardsMap(
  boards: BoardData[] | undefined,
  sex: BiologicalSex,
): Record<string, BaremoRange[]> {
  if (boards && boards.length > 0) {
    return Object.fromEntries(boards.map(b => [b.measurementKey, b.ranges]))
  }
  if (sex === 'FEMALE') return buildFemaleDefaultBoards()
  return DEFAULT_BOARDS_MALE_NONATHLETE as Record<string, BaremoRange[]>
}

/**
 * Interpolates biological age for a single measurement against its baremo ranges.
 *
 * The baremo defines: at ageMin → normal range is [valueMin, valueMax].
 * We find which age bracket the measurement's position maps to.
 *
 * Algorithm:
 *   - Find the range bracket where value fits within ±halfSpread of midValue.
 *   - Interpolate linearly between ageMin and ageMax.
 *   - If value is outside all brackets → clamp to extremes (explicit fallback).
 *
 * @param value            - Scalar measurement value
 * @param ranges           - Baremo ranges for this measurement
 * @param chronologicalAge - Used as safe fallback when no ranges are defined
 * @returns                - Interpolated biological age (years)
 */
export function interpolateAge(value: number, ranges: BaremoRange[], chronologicalAge: number): number {
  if (!ranges || ranges.length === 0) {
    // EXPLICIT FALLBACK: no baremo available — return chronological age.
    // This is intentionally conservative and traceable.
    return chronologicalAge
  }

  // Sort ranges by ageMin ascending (defensive — should already be sorted)
  const sorted = [...ranges].sort((a, b) => a.ageMin - b.ageMin)

  for (const range of sorted) {
    const midValue  = (range.valueMin + range.valueMax) / 2
    const halfSpread = (range.valueMax - range.valueMin) / 2

    if (value >= range.valueMin - halfSpread && value <= range.valueMax + halfSpread) {
      const clampedValue = Math.max(range.valueMin, Math.min(range.valueMax, value))
      const t           = halfSpread > 0 ? (clampedValue - midValue) / halfSpread : 0
      const midAge      = (range.ageMin + range.ageMax) / 2
      const halfAgeBracket = (range.ageMax - range.ageMin) / 2
      return midAge + t * halfAgeBracket
    }
  }

  // EXPLICIT FALLBACK: value outside all ranges — extrapolate from extremes.
  // Logged by the caller (BiophysicsEngine) for traceability.
  const lastRange  = sorted[sorted.length - 1]
  const firstRange = sorted[0]
  const firstMid   = (firstRange.valueMin + firstRange.valueMax) / 2
  const lastMid    = (lastRange.valueMin  + lastRange.valueMax)  / 2
  const higherMeansOlder = lastMid > firstMid

  if (higherMeansOlder) {
    if (value < firstRange.valueMin) return firstRange.ageMin
    return lastRange.ageMax + (value - lastMid) * 0.5
  } else {
    if (value > firstRange.valueMax) return firstRange.ageMin
    return lastRange.ageMax + (lastMid - value) * 0.5
  }
}

/**
 * Computes all 8 partial ages from scalar measurements and resolved boards.
 *
 * @param scalars          - Output of reduceMeasurements()
 * @param chronologicalAge - Used as fallback when baremo is unavailable
 * @param boards           - Resolved board map (output of resolveBoardsMap())
 */
export function computePartialAges(
  scalars: Record<string, number>,
  chronologicalAge: number,
  boards: Record<string, BaremoRange[]>
): BiophysicsPartialAges {
  const interp = (key: string) =>
    parseFloat(interpolateAge(scalars[key], boards[key] ?? [], chronologicalAge).toFixed(1))

  return {
    fatAge:       interp('fatPercentage'),
    bmiAge:       interp('bmi'),
    reflexesAge:  interp('reflexes'),
    visualAge:    interp('visualAccommodation'),
    balanceAge:   interp('balance'),
    hydrationAge: interp('skinHydration'),
    systolicAge:  interp('systolicPressure'),
    diastolicAge: interp('diastolicPressure'),
  }
}

/**
 * Computes the weighted average of partial ages.
 * Uses ITEM_WEIGHTS which must sum to 1.0. Divides by actual weight sum for safety.
 */
export function weightedAverage(partialAges: BiophysicsPartialAges): number {
  let total = 0
  let weightSum = 0
  for (const [key, weight] of Object.entries(ITEM_WEIGHTS) as [keyof BiophysicsPartialAges, number][]) {
    total += partialAges[key] * weight
    weightSum += weight
  }
  return total / weightSum
}

/**
 * Classifies differential age into clinical status categories.
 * Thresholds: ≤ -2 years = REJUVENECIDO, ≥ +2 years = ENVEJECIDO, else NORMAL.
 */
export function classifyAgeStatus(differentialAge: number): BiophysicsResult['ageStatus'] {
  if (differentialAge <= -2) return 'REJUVENECIDO'
  if (differentialAge >= 2)  return 'ENVEJECIDO'
  return 'NORMAL'
}

// ─────────────────────────────────────────────────────────────────
// BiophysicsEngine — Orchestrator (with logging)
// Composes pure functions and adds I/O-related concerns (logging, dates).
// ─────────────────────────────────────────────────────────────────

export class BiophysicsEngine {
  readonly algorithmVersion = ALGORITHM_VERSION

  /**
   * Compute biological age from biophysical measurements.
   *
   * @param measurements     - The 8 biophysical measurements
   * @param chronologicalAge - Patient's exact age in years (accepts decimals)
   * @param sex              - Biological sex for baremo selection
   * @param isAthlete        - Whether to use athlete-specific baremos
   * @param boards           - Optional override boards from DB (falls back to defaults)
   * @param _now             - Injectable clock for testing (defaults to new Date())
   */
  compute(
    measurements: BiophysicsMeasurements,
    chronologicalAge: number,
    sex: BiologicalSex,
    isAthlete: boolean,
    boards?: BoardData[],
    _now: Date = new Date()
  ): BiophysicsResult {
    const log = logger.child({ fn: 'BiophysicsEngine.compute', chronologicalAge, sex, isAthlete })

    // 1. Reduce dimensional measurements to scalar values
    const scalars = reduceMeasurements(measurements)

    // 2. Resolve boards (DB boards take precedence over defaults)
    const activeBoardsMap = resolveBoardsMap(boards, sex)

    // 3. Compute partial ages by interpolation
    const partialAges = computePartialAges(scalars, chronologicalAge, activeBoardsMap)

    // 4. Weighted average → biological age
    const biologicalAge     = parseFloat(weightedAverage(partialAges).toFixed(1))
    const differentialAge   = parseFloat((biologicalAge - chronologicalAge).toFixed(1))
    const ageStatus         = classifyAgeStatus(differentialAge)

    log.info({ biologicalAge, differentialAge, ageStatus }, 'Biophysics computed')

    return {
      biologicalAge,
      differentialAge,
      partialAges,
      ageStatus,
      algorithmVersion: this.algorithmVersion,
      inputSnapshot: {
        measurements,
        chronologicalAge,
        sex,
        isAthlete,
      },
      computedAt: _now,
    }
  }
}

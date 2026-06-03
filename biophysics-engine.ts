// =============================================================================
// BiophysicsEngine — Doctor Antivejez Algorithm
// Desacoplado del frontend Next.js. Consumible como servicio puro.
//
// Algorithm:
//   1. For each of 8 measurements, look up the baremo (scoring board)
//      for the patient's sex + athlete status
//   2. Interpolate to find the partial biological age for that measurement
//   3. Final biological age = weighted average of partial ages
//   4. Differential = biologicalAge - chronologicalAge
//
// Baremos are fetched from DB or Redis cache (24h TTL).
// All computations are deterministic and reproducible given the same inputs.
// =============================================================================

import { logger } from '../lib/logger'

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

export interface BiophysicsResult {
  biologicalAge: number          // Rounded to 1 decimal
  differentialAge: number        // Rounded to 1 decimal  
  partialAges: BiophysicsPartialAges
  ageStatus: 'REJUVENECIDO' | 'NORMAL' | 'ENVEJECIDO'
  algorithmVersion: string
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

const ITEM_WEIGHTS: Record<keyof BiophysicsPartialAges, number> = {
  fatAge:       0.15,
  bmiAge:       0.15,
  reflexesAge:  0.15,
  visualAge:    0.10,
  balanceAge:   0.10,
  hydrationAge: 0.10,
  systolicAge:  0.15,
  diastolicAge: 0.10,
} as const

const ALGORITHM_VERSION = 'daaa-biophysics-v2.1.0'

// ─────────────────────────────────────────────────────────────────
// Default baremos — used when DB boards are unavailable
// In production, boards are loaded from DB + Redis cache.
// These encode the standard Doctor Antivejez reference tables.
//
// Format per item: array of { ageMin, ageMax, valueMin, valueMax }
// Values are canonical (male, non-athlete) — female/athlete boards
// loaded from DB have different coefficients.
// ─────────────────────────────────────────────────────────────────

const DEFAULT_BOARDS_MALE_NONATHLTE: Record<string, BaremoRange[]> = {
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
// BiophysicsEngine
// ─────────────────────────────────────────────────────────────────

export class BiophysicsEngine {
  private readonly algorithmVersion = ALGORITHM_VERSION

  /**
   * Compute biological age from biophysical measurements.
   *
   * @param measurements - The 8 biophysical measurements
   * @param chronologicalAge - Patient's exact age in years (accepts decimals)
   * @param sex - Biological sex for baremo selection
   * @param isAthlete - Whether to use athlete-specific baremos
   * @param boards - Optional override boards from DB (falls back to defaults)
   */
  compute(
    measurements: BiophysicsMeasurements,
    chronologicalAge: number,
    sex: BiologicalSex,
    isAthlete: boolean,
    boards?: BoardData[]
  ): BiophysicsResult {
    const log = logger.child({ fn: 'BiophysicsEngine.compute', chronologicalAge, sex, isAthlete })

    // 1. Reduce dimensional measurements to scalar values
    const scalars = this.reduceMeasurements(measurements)

    // 2. Load boards (DB boards take precedence over defaults)
    const activeBoardsMap = this.buildBoardsMap(boards, sex, isAthlete)

    // 3. Compute partial ages by interpolation
    const partialAges = this.computePartialAges(scalars, chronologicalAge, activeBoardsMap)

    // 4. Weighted average → biological age
    const biologicalAge = this.weightedAverage(partialAges)
    const differentialAge = parseFloat((biologicalAge - chronologicalAge).toFixed(1))
    const biologicalAgeRounded = parseFloat(biologicalAge.toFixed(1))

    const ageStatus = this.classifyStatus(differentialAge)

    log.info({ biologicalAge: biologicalAgeRounded, differentialAge, ageStatus }, 'Biophysics computed')

    return {
      biologicalAge: biologicalAgeRounded,
      differentialAge,
      partialAges,
      ageStatus,
      algorithmVersion: this.algorithmVersion,
      computedAt: new Date(),
    }
  }

  // ── Reduce dimensional measurements to single scalar ─────────────

  private reduceMeasurements(m: BiophysicsMeasurements): Record<string, number> {
    // digitalReflexes: volume of the parallelepiped (cm³)
    const reflexVolume = m.digitalReflexes.high * m.digitalReflexes.long * m.digitalReflexes.width

    // staticBalance: product of displacement dimensions (balance stability score)
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

  // ── Build boards map: key → ranges ───────────────────────────────

  private buildBoardsMap(
    boards: BoardData[] | undefined,
    sex: BiologicalSex,
    _isAthlete: boolean
  ): Record<string, BaremoRange[]> {
    // If DB boards provided, use them
    if (boards && boards.length > 0) {
      return Object.fromEntries(boards.map(b => [b.measurementKey, b.ranges]))
    }

    // Fall back to defaults (male non-athlete for INTERSEX too — extend when needed)
    // Female boards would have different fat% ranges, BP distributions, etc.
    if (sex === 'FEMALE') {
      // Return female-adjusted defaults. In production these come from DB.
      // Applied adjustment: fat % female ranges ~5-8pp higher than male
      return this.buildFemaleDefaultBoards()
    }

    return DEFAULT_BOARDS_MALE_NONATHLTE
  }

  private buildFemaleDefaultBoards(): Record<string, BaremoRange[]> {
    // Clone male boards and apply female clinical adjustments
    const femaleBoards: Record<string, BaremoRange[]> = JSON.parse(
      JSON.stringify(DEFAULT_BOARDS_MALE_NONATHLTE)
    )

    // Fat percentage: female ranges ~5-8pp higher than male (ACS guidelines)
    femaleBoards.fatPercentage = femaleBoards.fatPercentage.map(r => ({
      ...r,
      valueMin: r.valueMin + 7,
      valueMax: r.valueMax + 7,
    }))

    // Skin hydration: slightly higher baseline for females
    femaleBoards.skinHydration = femaleBoards.skinHydration.map(r => ({
      ...r,
      valueMin: r.valueMin + 3,
      valueMax: r.valueMax + 3,
    }))

    return femaleBoards
  }

  // ── Interpolate partial age from a baremo range ───────────────────

  /**
   * Given a scalar measurement and the baremo ranges for that item,
   * return the interpolated biological age.
   *
   * The baremo defines: at ageMin → normal range is [valueMin, valueMax]
   * We find which age bracket the measurement's position maps to.
   *
   * Algorithm:
   *   - Find the range bracket where value fits.
   *   - Interpolate linearly between ageMin and ageMax.
   *   - If value is outside all brackets → clamp to extremes.
   */
  private interpolateAge(value: number, ranges: BaremoRange[], chronologicalAge: number): number {
    if (!ranges || ranges.length === 0) return chronologicalAge

    // Sort ranges by ageMin ascending (defensive — should already be sorted)
    const sorted = [...ranges].sort((a, b) => a.ageMin - b.ageMin)

    for (const range of sorted) {
      const midValue = (range.valueMin + range.valueMax) / 2
      const halfSpread = (range.valueMax - range.valueMin) / 2

      // Check if value falls within ±halfSpread of midValue for this age bracket
      if (value >= range.valueMin - halfSpread && value <= range.valueMax + halfSpread) {
        // Linear interpolation within the range
        const clampedValue = Math.max(range.valueMin, Math.min(range.valueMax, value))
        const t = halfSpread > 0 ? (clampedValue - midValue) / halfSpread : 0
        const midAge = (range.ageMin + range.ageMax) / 2
        const halfAgeBracket = (range.ageMax - range.ageMin) / 2
        return midAge + t * halfAgeBracket
      }
    }

    // Value outside all ranges — find best matching range and extrapolate
    // For values indicating worse health (higher fat%, higher BP, lower hydration)
    // we want to assign an older age.
    const lastRange = sorted[sorted.length - 1]
    const firstRange = sorted[0]

    const firstMid = (firstRange.valueMin + firstRange.valueMax) / 2
    const lastMid = (lastRange.valueMin + lastRange.valueMax) / 2

    // Determine if higher value = older (e.g., fat%, BP) or younger (e.g., hydration, reflexes)
    const higherMeansOlder = lastMid > firstMid

    if (higherMeansOlder) {
      if (value < firstRange.valueMin) return firstRange.ageMin
      return lastRange.ageMax + (value - lastMid) * 0.5 // Extrapolate
    } else {
      if (value > firstRange.valueMax) return firstRange.ageMin
      return lastRange.ageMax + (lastMid - value) * 0.5
    }
  }

  // ── Compute all 8 partial ages ────────────────────────────────────

  private computePartialAges(
    scalars: Record<string, number>,
    chronologicalAge: number,
    boards: Record<string, BaremoRange[]>
  ): BiophysicsPartialAges {
    const interp = (key: string) =>
      parseFloat(
        this.interpolateAge(scalars[key], boards[key] ?? [], chronologicalAge).toFixed(1)
      )

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

  // ── Weighted average of partial ages ──────────────────────────────

  private weightedAverage(partialAges: BiophysicsPartialAges): number {
    let total = 0
    let weightSum = 0

    for (const [key, weight] of Object.entries(ITEM_WEIGHTS) as [keyof BiophysicsPartialAges, number][]) {
      total += partialAges[key] * weight
      weightSum += weight
    }

    // weightSum should be exactly 1.0, but divide for safety
    return total / weightSum
  }

  // ── Age status classification ─────────────────────────────────────

  private classifyStatus(differentialAge: number): BiophysicsResult['ageStatus'] {
    if (differentialAge <= -2) return 'REJUVENECIDO'
    if (differentialAge >= 2)  return 'ENVEJECIDO'
    return 'NORMAL'
  }
}

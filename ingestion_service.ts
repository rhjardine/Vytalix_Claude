// @ts-nocheck — Prisma types require `prisma generate` (run `npm run db:generate`)
// =============================================================================
// Ingestion Service — unified entry point for all clinical data sources
// Sources: Manual API | CSV batch | FHIR R4 Bundle
// Every ingestion path converges on the same validation + normalization pipeline.
// =============================================================================

import { parse as parseCsv } from 'csv-parse/sync'
import { withTenant, writeAuditLog } from '../lib/db'
import { logger } from '../lib/logger'
import {
  getLoincEntry,
  normalizeUnit,
  validateObservationValue,
} from './loinc-registry'
import { PipelineOrchestrator } from '../pipeline/orchestrator'

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface RawObservationInput {
  patientId: string
  loincCode: string
  displayName?: string
  valueNumeric?: number
  valueText?: string
  unit?: string
  refRangeLow?: number
  refRangeHigh?: number
  observedAt: Date
  sourceSystem: string
  fhirResourceId?: string
}

export interface IngestionResult {
  observationId: string
  patientId: string
  loincCode: string
  normalizedValue: number | null
  normalizedUnit: string | null
  validationWarnings: string[]
  pipelineTriggered: boolean
}

export interface IngestionError {
  input: Partial<RawObservationInput>
  reason: string
  code: string
}

export interface BatchIngestionResult {
  accepted: number
  rejected: number
  total: number
  results: Array<IngestionResult | IngestionError>
}

// ─────────────────────────────────────────────────────────────────
// FHIR R4 types (minimal subset we care about)
// ─────────────────────────────────────────────────────────────────

interface FhirObservation {
  resourceType: 'Observation'
  id?: string
  status: string
  code: { coding: Array<{ system?: string; code: string; display?: string }> }
  subject: { reference: string }
  effectiveDateTime?: string
  effectivePeriod?: { start: string }
  valueQuantity?: { value: number; unit: string; system?: string; code?: string }
  valueCodeableConcept?: { coding: Array<{ display?: string }> }
  component?: Array<{
    code: { coding: Array<{ code: string }> }
    valueQuantity?: { value: number; unit: string }
  }>
  referenceRange?: Array<{ low?: { value: number }; high?: { value: number } }>
}

interface FhirPatient {
  resourceType: 'Patient'
  id?: string
  identifier?: Array<{ system?: string; value: string }>
  name?: Array<{ family?: string; given?: string[] }>
  birthDate?: string
  gender?: string
}

interface FhirBundle {
  resourceType: 'Bundle'
  entry?: Array<{ resource?: FhirObservation | FhirPatient | Record<string, unknown> }>
}

// ─────────────────────────────────────────────────────────────────
// Core Ingestion Service
// ─────────────────────────────────────────────────────────────────

export class IngestionService {
  private orchestrator: PipelineOrchestrator

  constructor() {
    this.orchestrator = new PipelineOrchestrator()
  }

  // ───────────────────────────────────────────
  // Single observation ingestion (API path)
  // ───────────────────────────────────────────
  async ingestSingle(
    tenantId: string,
    actorId: string,
    input: RawObservationInput,
    correlationId: string
  ): Promise<IngestionResult> {
    const log = logger.child({ correlationId, tenantId, fn: 'ingestSingle' })
    log.info({ loincCode: input.loincCode, patientId: input.patientId }, 'Ingesting single observation')

    const result = await this.processOne(tenantId, input, correlationId)

    if ('reason' in result) {
      throw new IngestionValidationError(result.reason, result.code)
    }

    // Write audit log
        await withTenant(tenantId, async (tc) => {
      await writeAuditLog(tc, {
        tenantId,
        actorId,
        actorRole: 'SYSTEM',
        resourceType: 'ClinicalObservation',
        resourceId: result.observationId,
        action: 'CREATE',
        diff: { after: { loincCode: input.loincCode, value: result.normalizedValue } },
      })
    })

    // Trigger downstream pipeline (non-blocking — pipeline failure does not fail ingestion)
    this.orchestrator
      .runFromObservation(tenantId, input.patientId, correlationId)
      .catch((err) => log.error({ err }, 'Pipeline trigger failed after observation ingest'))

    return result
  }

  // ───────────────────────────────────────────
  // Batch ingestion (JSON array or CSV)
  // ───────────────────────────────────────────
  async ingestBatch(
    tenantId: string,
    actorId: string,
    inputs: RawObservationInput[],
    options: { continueOnError: boolean },
    correlationId: string
  ): Promise<BatchIngestionResult> {
    const log = logger.child({ correlationId, tenantId, fn: 'ingestBatch', count: inputs.length })
    log.info('Starting batch ingestion')

    const results: Array<IngestionResult | IngestionError> = []
    const patientsToPipeline = new Set<string>()

    for (const input of inputs) {
      const result = await this.processOne(tenantId, input, correlationId)

      if ('reason' in result) {
        if (!options.continueOnError) {
          throw new IngestionValidationError(
            `Batch aborted: ${result.reason}`,
            result.code
          )
        }
        results.push(result)
      } else {
        results.push(result)
        patientsToPipeline.add(input.patientId)
      }
    }

    const accepted = results.filter((r) => !('reason' in r)).length
    const rejected = results.length - accepted

    log.info({ accepted, rejected }, 'Batch ingestion complete')

    // Trigger pipeline once per unique patient (not once per observation)
    for (const patientId of patientsToPipeline) {
      this.orchestrator
        .runFromObservation(tenantId, patientId, correlationId)
        .catch((err) => log.error({ err, patientId }, 'Pipeline trigger failed after batch ingest'))
    }

    return { accepted, rejected, total: inputs.length, results }
  }

  // ───────────────────────────────────────────
  // CSV parsing → batch ingestion
  // ───────────────────────────────────────────
  async ingestCsv(
    tenantId: string,
    actorId: string,
    csvBuffer: Buffer,
    options: { continueOnError: boolean },
    correlationId: string
  ): Promise<BatchIngestionResult> {
    const log = logger.child({ correlationId, tenantId, fn: 'ingestCsv' })

    let rows: Record<string, string>[]
    try {
      rows = parseCsv(csvBuffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      })
    } catch (e) {
      throw new IngestionValidationError('CSV parse failed: ' + (e as Error).message, 'CSV_PARSE_ERROR')
    }

    log.info({ rowCount: rows.length }, 'CSV parsed')

    // Resolve patient MRNs → IDs
        const mrns = [...new Set(rows.map((r) => r.patientMrn).filter(Boolean))]
    const patients = await withTenant(tenantId, async (tc) => {
      return tc.queryMany(
        `SELECT id, mrn FROM patients WHERE "tenantId"=$1::uuid AND mrn = ANY($2::text[])`,
        [tenantId, mrns]
      )
    })

    const mrnToId = new Map(patients.map((p: { id: string; mrn: string }) => [p.mrn, p.id]))

    const inputs: RawObservationInput[] = []
    const parseErrors: IngestionError[] = []

    for (const row of rows) {
      // Required columns: patientMrn, loincCode, value, unit, observedAt
      if (!row.patientMrn || !row.loincCode || !row.observedAt) {
        parseErrors.push({
          input: row as Partial<RawObservationInput>,
          reason: 'Missing required columns: patientMrn, loincCode, observedAt',
          code: 'MISSING_REQUIRED_COLUMNS',
        })
        continue
      }

      const patientId = mrnToId.get(row.patientMrn)
      if (!patientId) {
        parseErrors.push({
          input: { loincCode: row.loincCode },
          reason: `Patient MRN "${row.patientMrn}" not found in tenant`,
          code: 'PATIENT_NOT_FOUND',
        })
        continue
      }

      const numericValue = row.value ? parseFloat(row.value) : undefined

      inputs.push({
        patientId,
        loincCode: row.loincCode.trim(),
        displayName: row.displayName,
        valueNumeric: numericValue !== undefined && !isNaN(numericValue) ? numericValue : undefined,
        valueText: row.valueText,
        unit: row.unit?.trim(),
        observedAt: new Date(row.observedAt),
        sourceSystem: 'LAB_IMPORT',
      })
    }

    if (!options.continueOnError && parseErrors.length > 0) {
      throw new IngestionValidationError(
        `CSV validation failed: ${parseErrors[0].reason}`,
        parseErrors[0].code
      )
    }

    const batchResult = await this.ingestBatch(tenantId, actorId, inputs, options, correlationId)

    return {
      ...batchResult,
      total: rows.length,
      rejected: batchResult.rejected + parseErrors.length,
      results: [...parseErrors, ...batchResult.results],
    }
  }

  // ───────────────────────────────────────────
  // FHIR R4 Bundle ingestion
  // ───────────────────────────────────────────
  async ingestFhirBundle(
    tenantId: string,
    actorId: string,
    bundle: FhirBundle,
    options: { patientIdOverride?: string; dryRun?: boolean },
    correlationId: string
  ): Promise<{
    processed: number
    patients: number
    observations: number
    errors: Array<{ resourceType: string; resourceId?: string; error: string }>
    mappingReport: { mapped: number; unmapped: number; unmappedCodes: string[] }
  }> {
    const log = logger.child({ correlationId, tenantId, fn: 'ingestFhirBundle' })
    const entries = bundle.entry ?? []

    const errors: Array<{ resourceType: string; resourceId?: string; error: string }> = []
    const unmappedCodes: string[] = []
    let patientsResolved = 0
    let observationsIngested = 0

    // Step 1: Resolve patients from bundle
    const fhirPatientToInternalId = new Map<string, string>()

    if (options.patientIdOverride) {
      // All observations in bundle map to this patient
      fhirPatientToInternalId.set('*', options.patientIdOverride)
    }

    
    for (const entry of entries) {
      const resource = entry.resource
      if (!resource || resource.resourceType !== 'Patient') continue

      const fhirPatient = resource as FhirPatient
      const fhirId = fhirPatient.id ?? 'unknown'

      // Try to match by identifier (MRN)
      const mrnIdentifier = fhirPatient.identifier?.find(
        (i) => i.system?.includes('mrn') || i.system?.includes('MR')
      )
      const mrn = mrnIdentifier?.value

      if (mrn) {
        const patient = await withTenant(tenantId, async (tc) => {
          return tc.queryOne('SELECT * FROM patients WHERE "tenantId"=$1::uuid AND mrn=$2', [tenantId, mrn])
        })

        if (patient) {
          fhirPatientToInternalId.set(fhirId, patient.id)
          patientsResolved++
        } else {
          errors.push({ resourceType: 'Patient', resourceId: fhirId, error: `MRN "${mrn}" not found` })
        }
      } else {
        errors.push({ resourceType: 'Patient', resourceId: fhirId, error: 'No MRN identifier found' })
      }
    }

    // Step 2: Process Observation resources
    const observationInputs: RawObservationInput[] = []

    for (const entry of entries) {
      const resource = entry.resource
      if (!resource || resource.resourceType !== 'Observation') continue

      const obs = resource as FhirObservation
      const fhirId = obs.id ?? 'unknown'

      try {
        const mapped = this.mapFhirObservation(obs, fhirPatientToInternalId)
        if (!mapped) {
          errors.push({ resourceType: 'Observation', resourceId: fhirId, error: 'Could not map FHIR Observation' })
          continue
        }

        // Check LOINC support
        const loincEntry = getLoincEntry(mapped.loincCode)
        if (!loincEntry) {
          unmappedCodes.push(mapped.loincCode)
          errors.push({
            resourceType: 'Observation',
            resourceId: fhirId,
            error: `LOINC code ${mapped.loincCode} not in registry`,
          })
          continue
        }

        observationInputs.push(mapped)
      } catch (e) {
        errors.push({
          resourceType: 'Observation',
          resourceId: fhirId,
          error: (e as Error).message,
        })
      }
    }

    log.info({ fhirObsCount: observationInputs.length, dryRun: options.dryRun }, 'FHIR mapping complete')

    if (!options.dryRun && observationInputs.length > 0) {
      const batchResult = await this.ingestBatch(
        tenantId,
        actorId,
        observationInputs,
        { continueOnError: true },
        correlationId
      )
      observationsIngested = batchResult.accepted
    }

    return {
      processed: entries.length,
      patients: patientsResolved,
      observations: observationsIngested,
      errors,
      mappingReport: {
        mapped: observationInputs.length,
        unmapped: unmappedCodes.length,
        unmappedCodes: [...new Set(unmappedCodes)],
      },
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Private: core normalization + persistence for a single observation
  // ─────────────────────────────────────────────────────────────────
  private async processOne(
    tenantId: string,
    input: RawObservationInput,
    correlationId: string
  ): Promise<IngestionResult | IngestionError> {
    // 1. Validate date
    if (isNaN(input.observedAt.getTime())) {
      return { input, reason: 'observedAt is not a valid date', code: 'INVALID_DATE' }
    }
    if (input.observedAt > new Date()) {
      return { input, reason: 'observedAt is in the future', code: 'FUTURE_DATE' }
    }

    // 2. Validate numeric value against physiological bounds
    let warnings: string[] = []
    let normalizedValue: number | null = input.valueNumeric ?? null
    let normalizedUnit: string | null = input.unit ?? null

    if (input.valueNumeric !== undefined && input.unit) {
      const validation = validateObservationValue(input.loincCode, input.valueNumeric, input.unit)
      if (!validation.valid) {
        return { input, reason: validation.reason, code: validation.code }
      }
      warnings = validation.warnings

      // 3. Normalize units to canonical
      const normalized = normalizeUnit(input.loincCode, input.valueNumeric, input.unit)
      normalizedValue = normalized.normalizedValue
      normalizedUnit = normalized.normalizedUnit
    }

    // 4. Resolve display name from LOINC registry if not provided
    const loincEntry = getLoincEntry(input.loincCode)
    const displayName = input.displayName ?? loincEntry?.displayName ?? input.loincCode

    // 5. Persist
        const observation = await withTenant(tenantId, async (tc) => {
      return tc.queryOne(
        `INSERT INTO clinical_observations (
           "tenantId","patientId","loincCode","displayName","valueNumeric","valueText",
           unit,"refRangeLow","refRangeHigh","sourceSystem","fhirResourceId","observedAt","isCorrection","ingestedAt"
         ) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::timestamptz,false,NOW()) RETURNING *`,
        [tenantId, input.patientId, input.loincCode, displayName,
         normalizedValue !== null ? Number(normalizedValue) : null,
         input.valueText ?? null, normalizedUnit,
         input.refRangeLow !== undefined ? Number(input.refRangeLow) : null,
         input.refRangeHigh !== undefined ? Number(input.refRangeHigh) : null,
         input.sourceSystem, input.fhirResourceId ?? null, input.observedAt]
      )
    })

    return {
      observationId: observation.id,
      patientId: input.patientId,
      loincCode: input.loincCode,
      normalizedValue,
      normalizedUnit,
      validationWarnings: warnings,
      pipelineTriggered: true,
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Private: FHIR Observation → internal format
  // ─────────────────────────────────────────────────────────────────
  private mapFhirObservation(
    obs: FhirObservation,
    fhirPatientToId: Map<string, string>
  ): RawObservationInput | null {
    // Resolve patient
    const subjectRef = obs.subject?.reference
    const fhirPatientId = subjectRef?.split('/').pop() ?? '*'
    const patientId = fhirPatientToId.get(fhirPatientId) ?? fhirPatientToId.get('*')
    if (!patientId) return null

    // Extract LOINC code
    const loincCoding = obs.code?.coding?.find(
      (c) => !c.system || c.system.includes('loinc')
    )
    if (!loincCoding?.code) return null

    // Extract observed time
    const observedAt = new Date(obs.effectiveDateTime ?? obs.effectivePeriod?.start ?? '')
    if (isNaN(observedAt.getTime())) return null

    // Handle Blood Pressure panel (LOINC 55284-4 / 85354-9 — uses components)
    if (obs.component && obs.component.length > 0) {
      // BP panels return multiple components — we only handle the first one here
      // In a full implementation this would return an array
      const systolicComponent = obs.component.find(
        (c) => c.code.coding.some((co) => co.code === '8480-6')
      )
      if (systolicComponent?.valueQuantity) {
        return {
          patientId,
          loincCode: '8480-6',
          displayName: 'Systolic Blood Pressure',
          valueNumeric: systolicComponent.valueQuantity.value,
          unit: systolicComponent.valueQuantity.unit,
          observedAt,
          sourceSystem: 'FHIR_IMPORT',
          fhirResourceId: obs.id,
        }
      }
    }

    // Simple valueQuantity
    if (obs.valueQuantity) {
      return {
        patientId,
        loincCode: loincCoding.code,
        displayName: loincCoding.display,
        valueNumeric: obs.valueQuantity.value,
        unit: obs.valueQuantity.code ?? obs.valueQuantity.unit,
        refRangeLow: obs.referenceRange?.[0]?.low?.value,
        refRangeHigh: obs.referenceRange?.[0]?.high?.value,
        observedAt,
        sourceSystem: 'FHIR_IMPORT',
        fhirResourceId: obs.id,
      }
    }

    // Coded value (e.g., smoking status)
    if (obs.valueCodeableConcept) {
      return {
        patientId,
        loincCode: loincCoding.code,
        displayName: loincCoding.display,
        valueText: obs.valueCodeableConcept.coding?.[0]?.display,
        observedAt,
        sourceSystem: 'FHIR_IMPORT',
        fhirResourceId: obs.id,
      }
    }

    return null
  }
}

export class IngestionValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message)
    this.name = 'IngestionValidationError'
  }
}

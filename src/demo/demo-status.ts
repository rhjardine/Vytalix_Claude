// =============================================================================
// Demo Status Endpoint + Demo-Visible Logging
//
// GET /demo/status — responde en <100ms con estado del sistema demo.
// DemoLogger     — logs legibles en pantalla durante demo (no técnicos).
//
// Uses pg direct (getDb().rawQuery) — no Prisma binary required.
// =============================================================================

import { Request, Response } from 'express'
import { getDb } from '../platform/db'
import { DEMO } from './demo-dataset'

// ─────────────────────────────────────────────────────────────────
// GET /demo/status
// ─────────────────────────────────────────────────────────────────

export async function getDemoStatus(_req: Request, res: Response) {
  try {
    const db = getDb()

    // Parallel queries — fast, no tenant context needed for counts
    const [r1, r2, r3, r4, r5] = await Promise.all([
      db.rawQuery<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM patients WHERE "tenantId"=$1::uuid`,
        [DEMO.TENANT.ID]
      ),
      db.rawQuery<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM recommendations WHERE "tenantId"=$1::uuid AND status='PENDING'`,
        [DEMO.TENANT.ID]
      ),
      db.rawQuery<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM recommendations WHERE "tenantId"=$1::uuid AND status='PENDING' AND urgency='SOON'`,
        [DEMO.TENANT.ID]
      ),
      db.rawQuery<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM clinical_observations WHERE "tenantId"=$1::uuid`,
        [DEMO.TENANT.ID]
      ),
      db.rawQuery<{ pct: string; cat: string }>(
        `SELECT "valuePercent"::float AS pct, "riskCategory" AS cat
         FROM risk_scores WHERE "tenantId"=$1::uuid AND "scoreType"='CARDIOVASCULAR_10Y'
         ORDER BY "computedAt" DESC LIMIT 1`,
        [DEMO.TENANT.ID]
      ),
    ])

    const patients     = Number(r1.rows[0]?.n ?? 0)
    const pending      = Number(r2.rows[0]?.n ?? 0)
    const urgent       = Number(r3.rows[0]?.n ?? 0)
    const observations = Number(r4.rows[0]?.n ?? 0)
    const scoreRow     = r5.rows[0] ?? null

    const allGood =
      patients === DEMO.VALIDATION.TOTAL_PATIENTS &&
      pending  === DEMO.VALIDATION.PENDING_DECISIONS

    res.json({
      ready:        allGood,
      patients,
      decisions:    pending,
      alerts:       urgent,
      observations,
      latestRisk:   scoreRow
        ? { percent: Number(scoreRow.pct), category: scoreRow.cat }
        : null,
      checks: {
        patients:  patients === DEMO.VALIDATION.TOTAL_PATIENTS,
        decisions: pending  === DEMO.VALIDATION.PENDING_DECISIONS,
        riskScore: !!scoreRow,
      },
    })
  } catch (err) {
    res.status(503).json({ ready: false, error: 'Database unreachable' })
  }
}

// ─────────────────────────────────────────────────────────────────
// Demo Logger — human-readable, non-technical output
// ─────────────────────────────────────────────────────────────────

const COLORS = {
  blue:   '\x1b[34m',
  green:  '\x1b[32m',
  amber:  '\x1b[33m',
  red:    '\x1b[31m',
  reset:  '\x1b[0m',
  dim:    '\x1b[2m',
  bold:   '\x1b[1m',
}

function ts() {
  return COLORS.dim + new Date().toLocaleTimeString('en', { hour12: false }) + COLORS.reset
}

export const demoLog = {
  observationProcessed(loincCode: string, value: number, unit: string, patientName: string) {
    const label = LOINC_LABELS[loincCode] ?? loincCode
    console.log(`${ts()}  ${COLORS.blue}[Observation]${COLORS.reset}  ${patientName} — ${label}: ${value} ${unit}`)
  },

  riskCalculated(patientName: string, percent: number, category: string) {
    const color = category === 'HIGH' || category === 'VERY_HIGH' ? COLORS.red
                : category === 'MODERATE' ? COLORS.amber : COLORS.green
    console.log(`${ts()}  ${COLORS.blue}[Risk Score]${COLORS.reset}   ${patientName} — ${color}${percent}% ${category}${COLORS.reset}`)
  },

  decisionGenerated(patientName: string, title: string, urgency: string) {
    const color = urgency === 'URGENT' || urgency === 'CRITICAL' ? COLORS.red
                : urgency === 'SOON' ? COLORS.amber : COLORS.dim
    console.log(`${ts()}  ${color}[Alert]${COLORS.reset}        ${patientName} — ${title}`)
  },

  pipelineComplete(patientName: string, stages: number, ms: number) {
    console.log(`${ts()}  ${COLORS.green}[Pipeline]${COLORS.reset}     ${patientName} — ${stages} stages complete in ${ms}ms`)
  },

  observationIngested(count: number, source: string) {
    console.log(`${ts()}  ${COLORS.blue}[Ingestion]${COLORS.reset}    ${count} observation(s) from ${source}`)
  },

  apiRequest(method: string, path: string, ms: number, status: number) {
    const color = status >= 400 ? COLORS.red : status >= 300 ? COLORS.amber : COLORS.dim
    console.log(`${ts()}  ${COLORS.dim}[API]${COLORS.reset}          ${method} ${path} → ${color}${status}${COLORS.reset} (${ms}ms)`)
  },

  systemReady() {
    console.log(`\n${COLORS.bold}  Vytalix Clinical Intelligence Engine${COLORS.reset}`)
    console.log(`  ${COLORS.green}System ready${COLORS.reset} — all services operational\n`)
  },
}

// ─────────────────────────────────────────────────────────────────
// Express middleware — attaches demo logging to request lifecycle
// ─────────────────────────────────────────────────────────────────

export function demoLoggingMiddleware(req: Request, res: Response, next: Function) {
  const start = Date.now()
  res.on('finish', () => {
    const ms = Date.now() - start
    if (req.path.startsWith('/v1') || req.path.startsWith('/demo')) {
      demoLog.apiRequest(req.method, req.path, ms, res.statusCode)
    }
  })
  next()
}

// ─────────────────────────────────────────────────────────────────
// LOINC display names for demo logs
// ─────────────────────────────────────────────────────────────────

const LOINC_LABELS: Record<string, string> = {
  '2089-1':  'LDL Cholesterol',
  '2085-9':  'HDL Cholesterol',
  '2093-3':  'Total Cholesterol',
  '8480-6':  'Systolic BP',
  '8462-4':  'Diastolic BP',
  '2345-7':  'Fasting Glucose',
  '39156-5': 'BMI',
  '30522-7': 'hsCRP',
  '4548-4':  'HbA1c',
}

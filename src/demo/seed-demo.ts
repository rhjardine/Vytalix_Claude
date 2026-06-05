// @ts-nocheck
// =============================================================================
// Demo Seeder — uses pg directly (no Prisma generate required)
// Deterministic: all IDs and values from demo-dataset.ts (frozen constants)
// =============================================================================

import { getDb } from '../platform/db'
import { DEMO } from './demo-dataset'

const db = getDb()
const tick = (msg: string) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`)
const sql  = (q: string, p?: any[]) => db.rawQuery(q, p)

async function seed() {
  console.log('\n\x1b[1m  Vytalix Demo Seed\x1b[0m\n')

  // 1. Tenant
  await sql(`
    INSERT INTO tenants (id, slug, name, "planTier", "isActive", "createdAt", "updatedAt")
    VALUES ($1::uuid, $2, $3, 'ENTERPRISE', true, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET name = $3, "updatedAt" = NOW()`,
    [DEMO.TENANT.ID, DEMO.TENANT.SLUG, DEMO.TENANT.NAME])
  tick(`Tenant: ${DEMO.TENANT.NAME}`)

  // 2. Organization
  await sql(`
    INSERT INTO organizations (id, "tenantId", name, "orgType", "isActive", "createdAt", "updatedAt")
    VALUES ($1::uuid, $2::uuid, $3, 'CLINIC', true, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET name = $3`,
    [DEMO.ORGANIZATION.ID, DEMO.TENANT.ID, DEMO.ORGANIZATION.NAME])
  tick('Organization created')

  // 3. Physician user (placeholder hash — bootstrap.ts sets real bcrypt hash)
  await sql(`
    INSERT INTO users (id, "tenantId", "organizationId", email, "passwordHash", role, "firstName", "lastName", "isActive", "createdAt", "updatedAt")
    VALUES ($1::uuid, $2::uuid, $3::uuid, $4, '$2b$12$placeholder', 'PHYSICIAN', 'Sofia', 'Martinez', true, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET "organizationId" = $3::uuid`,
    [DEMO.PHYSICIAN.ID, DEMO.TENANT.ID, DEMO.ORGANIZATION.ID, DEMO.PHYSICIAN.EMAIL])
  tick(`Physician: ${DEMO.PHYSICIAN.NAME}`)

  // 4. Protocol + rule
  await sql(`
    INSERT INTO protocols (id, "tenantId", "organizationId", name, "clinicalDomain", description, "isActive", "createdBy", "createdAt", "updatedAt")
    VALUES ($1::uuid, $2::uuid, $3::uuid, 'Protocolo Cardiovascular + Longevidad', 'CARDIOVASCULAR', 'ACC/AHA 2018 + ADA 2024', true, $4::uuid, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING`,
    [DEMO.PROTOCOL.ID, DEMO.TENANT.ID, DEMO.ORGANIZATION.ID, DEMO.PHYSICIAN.ID])
  await sql(`
    INSERT INTO protocol_rules (id, "tenantId", "protocolId", name, description, "conditionField", "conditionOperator", "conditionThreshold", "actionType", "recommendationText", urgency, priority, "isActive", "createdAt")
    VALUES ($1::uuid, $2::uuid, $3::uuid, 'LDL >= 190 mg/dL', 'ACC/AHA Grade I Level B-R', 'latestLdlMgDl', 'gte', '190'::jsonb, 'PRESCRIBE_MEDICATION', 'LDL-C de {value} mg/dL indica estatina de alta intensidad.', 'SOON', 10, true, NOW())
    ON CONFLICT (id) DO NOTHING`,
    [DEMO.PROTOCOL.RULE, DEMO.TENANT.ID, DEMO.PROTOCOL.ID])
  tick('Protocol + rule')

  // 5. Patients
  const patients = [
    [DEMO.PATIENT_1.ID, DEMO.PATIENT_1.MRN, DEMO.PATIENT_1.FIRST_NAME, DEMO.PATIENT_1.LAST_NAME, DEMO.PATIENT_1.DATE_OF_BIRTH, DEMO.PATIENT_1.SEX],
    [DEMO.PATIENT_2.ID, DEMO.PATIENT_2.MRN, DEMO.PATIENT_2.FIRST_NAME, DEMO.PATIENT_2.LAST_NAME, DEMO.PATIENT_2.DATE_OF_BIRTH, DEMO.PATIENT_2.SEX],
  ]
  for (const [id, mrn, fn, ln, dob, sex] of patients) {
    await sql(`
      INSERT INTO patients (id, "tenantId", "organizationId", mrn, "firstName", "lastName", "dateOfBirth", "biologicalSex", status, "enrolledAt", "createdAt", "updatedAt")
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::date, $8, 'ACTIVE', NOW(), NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET mrn = $4`,
      [id, DEMO.TENANT.ID, DEMO.ORGANIZATION.ID, mrn, fn, ln, dob, sex])
  }
  tick('Patients: Roberto Vargas + Ana Restrepo')

  // 6. Observations — delete existing first for exact count
  await sql(`DELETE FROM clinical_observations WHERE "patientId" IN ($1::uuid, $2::uuid)`,
    [DEMO.PATIENT_1.ID, DEMO.PATIENT_2.ID])

  for (const obs of DEMO.OBSERVATIONS_P1) {
    await sql(`
      INSERT INTO clinical_observations ("tenantId", "patientId", "loincCode", "displayName", "valueNumeric", unit, "sourceSystem", "isCorrection", "observedAt", "ingestedAt")
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, 'MANUAL_ENTRY', false, $7::timestamptz, NOW())`,
      [DEMO.TENANT.ID, DEMO.PATIENT_1.ID, obs.loincCode, obs.name, obs.value, obs.unit, obs.date])
  }
  for (const obs of DEMO.OBSERVATIONS_P2) {
    await sql(`
      INSERT INTO clinical_observations ("tenantId", "patientId", "loincCode", "displayName", "valueNumeric", unit, "sourceSystem", "isCorrection", "observedAt", "ingestedAt")
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, 'MANUAL_ENTRY', false, $7::timestamptz, NOW())`,
      [DEMO.TENANT.ID, DEMO.PATIENT_2.ID, obs.loincCode, obs.name, obs.value, obs.unit, obs.date])
  }
  tick(`Observations: ${DEMO.OBSERVATIONS_P1.length + DEMO.OBSERVATIONS_P2.length} records`)

  // 7. Health snapshots (upsert)
  await sql(`
    INSERT INTO patient_health_snapshots ("tenantId", "patientId", "latestLdlMgDl", "latestHdlMgDl", "latestTotalCholesterol", "latestSystolicBp", "latestDiastolicBp", "latestFastingGlucose", "isSmoker", "hasDiabetes", "isOnAntihypertensives", "ageAtSnapshot", "lastObservationAt", "snapshotVersion", "updatedAt")
    VALUES ($1::uuid, $2::uuid, 213, 42, 278, 148, 94, 112, true, false, false, 56, '2024-11-10'::date, 3, NOW())
    ON CONFLICT ("patientId") DO UPDATE SET "latestLdlMgDl"=213, "latestHdlMgDl"=42, "latestTotalCholesterol"=278, "latestSystolicBp"=148, "latestDiastolicBp"=94, "latestFastingGlucose"=112, "isSmoker"=true, "hasDiabetes"=false, "isOnAntihypertensives"=false, "ageAtSnapshot"=56, "snapshotVersion"=3, "updatedAt"=NOW()`,
    [DEMO.TENANT.ID, DEMO.PATIENT_1.ID])
  await sql(`
    INSERT INTO patient_health_snapshots ("tenantId", "patientId", "latestLdlMgDl", "latestHdlMgDl", "latestSystolicBp", "latestFastingGlucose", "ageAtSnapshot", "lastObservationAt", "snapshotVersion", "updatedAt")
    VALUES ($1::uuid, $2::uuid, 118, 72, 116, 88, 49, '2024-10-05'::date, 1, NOW())
    ON CONFLICT ("patientId") DO UPDATE SET "latestLdlMgDl"=118, "latestHdlMgDl"=72, "latestSystolicBp"=116, "latestFastingGlucose"=88, "ageAtSnapshot"=49, "snapshotVersion"=1, "updatedAt"=NOW()`,
    [DEMO.TENANT.ID, DEMO.PATIENT_2.ID])
  tick('Health snapshots')

  // 8. Risk score
  await sql(`DELETE FROM risk_scores WHERE "patientId" = $1::uuid`, [DEMO.PATIENT_1.ID])
  await sql(`
    INSERT INTO risk_scores (id, "tenantId", "patientId", "scoreType", value, "valuePercent", "riskCategory", "algorithmId", "algorithmVersion", "inputSnapshot", "computedAt")
    VALUES ($1::uuid, $2::uuid, $3::uuid, 'CARDIOVASCULAR_10Y', 0.3421, 34.21, 'HIGH', 'framingham_2008_updated', '1.0.0', $4::jsonb, NOW())`,
    [DEMO.RISK_SCORE.ID, DEMO.TENANT.ID, DEMO.PATIENT_1.ID, JSON.stringify(DEMO.RISK_SCORE.INPUT_SNAPSHOT)])
  tick(`Risk score: 34.21% — HIGH`)

  // 9. Recommendations + decision traces
  await sql(`DELETE FROM decision_traces WHERE "recommendationId" IN (SELECT id FROM recommendations WHERE "patientId" = $1::uuid)`, [DEMO.PATIENT_1.ID])
  await sql(`DELETE FROM recommendations WHERE "patientId" = $1::uuid`, [DEMO.PATIENT_1.ID])

  const RECS = [
    { id: 'a1b2c3d4-0000-4000-8000-000000000030', urgency: 'SOON',
      title: 'LDL-C gravemente elevado: 213 mg/dL',
      body:  'LDL-C de 213 mg/dL supera el umbral ACC/AHA (≥190 mg/dL). Iniciar atorvastatina 40-80 mg.',
      explanation: { summary: 'LDL-C de 213 mg/dL supera el umbral ACC/AHA para estatinas de alta intensidad.', primaryFactors: ['LDL-C 213 mg/dL ≥ umbral 190 mg/dL (Grado I, Nivel B-R)', 'Tendencia ascendente: 162→188→213 (+31.5%)', 'Riesgo 10a: 34.2% (ALTO)'], cautionFactors: ['HDL-C 42 mg/dL — por debajo del rango protector'], missingData: ['Historia familiar no documentada'], confidence: 'high', evidenceGrade: 'Grado I, Nivel B-R', guidelineReference: 'Guía ACC/AHA 2018 Colesterol' } },
    { id: 'a1b2c3d4-0000-4000-8000-000000000031', urgency: 'SOON',
      title: 'Hipertensión Stage 2: 148/94 mmHg',
      body:  'PA 148 mmHg cumple Stage 2 ACC/AHA 2017. Iniciar antihipertensivo. Meta: <130/80 mmHg.',
      explanation: { summary: 'PA 148/94 mmHg cumple Stage 2 con tendencia ascendente en 6 meses.', primaryFactors: ['PA 148 mmHg ≥ Stage 2 (140 mmHg)', 'Tendencia: 136→142→148 (+8.8%)'], cautionFactors: ['Confirmar con ≥2 mediciones'], missingData: ['MAPA no disponible'], confidence: 'high', evidenceGrade: 'Grado I, Nivel A', guidelineReference: 'Guía ACC/AHA 2017 Hipertensión' } },
    { id: 'a1b2c3d4-0000-4000-8000-000000000032', urgency: 'ROUTINE',
      title: 'Prediabetes: glucosa 112 mg/dL',
      body:  'Glucosa 112 mg/dL en rango prediabetes ADA (100-125). Intervención estilo de vida.',
      explanation: { summary: 'Glucosa 112 mg/dL confirma prediabetes con tendencia ascendente.', primaryFactors: ['Glucosa 112 mg/dL en rango prediabetes ADA', 'Tendencia: 105→109→112 (+6.7%)'], cautionFactors: ['Confirmar con HbA1c'], missingData: ['HbA1c no disponible'], confidence: 'medium', evidenceGrade: 'Grado I, Nivel A', guidelineReference: 'Estándares ADA 2024' } },
  ]

  for (const rec of RECS) {
    await sql(`
      INSERT INTO recommendations (id, "tenantId", "patientId", "protocolId", "protocolRuleId", "riskScoreId", category, urgency, title, body, status, "assignedTo", "createdAt")
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, 'CARDIOVASCULAR', $7, $8, $9, 'PENDING', $10::uuid, NOW())`,
      [rec.id, DEMO.TENANT.ID, DEMO.PATIENT_1.ID, DEMO.PROTOCOL.ID, DEMO.PROTOCOL.RULE, DEMO.RISK_SCORE.ID, rec.urgency, rec.title, rec.body, DEMO.PHYSICIAN.ID])
    await sql(`
      INSERT INTO decision_traces ("tenantId", "recommendationId", "engineVersion", "rulesFired", "riskScoreSnapshot", "patientSnapshotAtDecision", explanation, "tracedAt")
      VALUES ($1::uuid, $2::uuid, '1.0.0', $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, NOW())`,
      [
        DEMO.TENANT.ID, rec.id,
        JSON.stringify([{ ruleId: 'H-00x', ruleName: rec.title, passed: true, operator: 'hardened_rule', clinicalWeight: 1.0 }]),
        JSON.stringify({ scoreType: 'CARDIOVASCULAR_10Y', valuePercent: 34.21, riskCategory: 'HIGH' }),
        JSON.stringify({ latestLdlMgDl: 213, latestHdlMgDl: 42, latestSystolicBp: 148, latestFastingGlucose: 112 }),
        JSON.stringify(rec.explanation),
      ])
  }
  tick('3 recommendations + 3 decision traces')

  console.log('\n\x1b[32m  Seed complete.\x1b[0m Run \x1b[36mmake check\x1b[0m to validate.\n')
  process.exit(0)
}

seed().catch(e => { console.error('Seed error:', e.message); process.exit(1) })

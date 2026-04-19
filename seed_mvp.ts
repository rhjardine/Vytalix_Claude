// =============================================================================
// Vytalix MVP — Seed: one tenant, one org, one physician, two patients,
//               cardiovascular protocol with 3 rules, sample observations.
// Run with: npx prisma db seed
// =============================================================================

import { PrismaClient, BiologicalSex, ObservationSource, RiskCategory, RiskScoreType, ClinicalDomain, ActionType, Urgency } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding Vytalix MVP...')

  // ---------------------------------------------------------------------------
  // 1. Tenant
  // ---------------------------------------------------------------------------
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-cardio-clinic' },
    update: {},
    create: {
      slug: 'demo-cardio-clinic',
      name: 'Demo Cardiology Clinic',
      planTier: 'PROFESSIONAL',
    }
  })
  console.log(`✓ Tenant: ${tenant.name} (${tenant.id})`)

  // For seeding we bypass RLS by setting the session variable directly.
  await prisma.$executeRaw`SET app.current_tenant = ${tenant.id}`

  // ---------------------------------------------------------------------------
  // 2. Organization
  // ---------------------------------------------------------------------------
  const org = await prisma.organization.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      tenantId: tenant.id,
      name: 'Cardiology Unit — Main Campus',
      orgType: 'CLINIC',
    }
  })
  console.log(`✓ Organization: ${org.name}`)

  // ---------------------------------------------------------------------------
  // 3. Physician user
  // ---------------------------------------------------------------------------
  const physician = await prisma.user.upsert({
    where: { id: '00000000-0000-4000-8000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000002',
      tenantId: tenant.id,
      organizationId: org.id,
      email: 'dr.garcia@demo-cardio-clinic.vytalix.dev',
      passwordHash: '$2b$12$placeholder_hash_replace_before_use',
      role: 'PHYSICIAN',
      firstName: 'Elena',
      lastName: 'García',
    }
  })
  console.log(`✓ Physician: Dr. ${physician.firstName} ${physician.lastName}`)

  // ---------------------------------------------------------------------------
  // 4. Cardiovascular Protocol with 3 rules
  // ---------------------------------------------------------------------------
  const protocol = await prisma.protocol.upsert({
    where: { id: '00000000-0000-4000-8000-000000000003' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000003',
      tenantId: tenant.id,
      organizationId: org.id,
      name: 'ACC/AHA Cardiovascular Risk Protocol — MVP',
      clinicalDomain: 'CARDIOVASCULAR',
      description: 'Simplified Framingham-based cardiovascular risk assessment. Triggers recommendations at defined LDL, BP, and combined-risk thresholds.',
      createdBy: physician.id,
    }
  })
  console.log(`✓ Protocol: ${protocol.name}`)

  // Rule 1: Very high LDL
  await prisma.protocolRule.upsert({
    where: { id: '00000000-0000-4000-8000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000010',
      tenantId: tenant.id,
      protocolId: protocol.id,
      name: 'Severely elevated LDL (≥190 mg/dL)',
      description: 'ACC/AHA guideline: LDL ≥190 mg/dL warrants statin therapy regardless of 10-year risk. Grade I, Level B-R.',
      conditionField: 'latestLdlMgDl',
      conditionOperator: 'gte',
      conditionThreshold: 190,
      actionType: 'PRESCRIBE_MEDICATION',
      recommendationText: 'LDL-C of {value} mg/dL meets ACC/AHA threshold for high-intensity statin therapy (atorvastatin 40–80 mg or rosuvastatin 20–40 mg). Initiate treatment and recheck lipid panel in 4–12 weeks.',
      urgency: 'SOON',
      priority: 10,
    }
  })

  // Rule 2: High systolic BP
  await prisma.protocolRule.upsert({
    where: { id: '00000000-0000-4000-8000-000000000011' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000011',
      tenantId: tenant.id,
      protocolId: protocol.id,
      name: 'Stage 2 hypertension (systolic ≥140 mmHg)',
      description: 'JNC 8 / ACC/AHA 2017: Systolic BP ≥140 mmHg constitutes Stage 2 hypertension requiring pharmacological intervention.',
      conditionField: 'latestSystolicBp',
      conditionOperator: 'gte',
      conditionThreshold: 140,
      actionType: 'PRESCRIBE_MEDICATION',
      recommendationText: 'Systolic BP of {value} mmHg meets Stage 2 hypertension criteria. Initiate antihypertensive therapy. First-line options: thiazide diuretic, ACE inhibitor, ARB, or calcium channel blocker per patient profile. Target: <130/80 mmHg.',
      urgency: 'SOON',
      priority: 20,
    }
  })

  // Rule 3: Elevated combined risk (LDL + BP borderline but combined concerning)
  await prisma.protocolRule.upsert({
    where: { id: '00000000-0000-4000-8000-000000000012' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000012',
      tenantId: tenant.id,
      protocolId: protocol.id,
      name: 'Elevated LDL with borderline BP — lifestyle intervention',
      description: 'Both LDL ≥130 and systolic ≥130 present without meeting individual thresholds. Therapeutic lifestyle change indicated.',
      conditionField: 'latestLdlMgDl',
      conditionOperator: 'gte',
      conditionThreshold: 130,
      actionType: 'LIFESTYLE_INTERVENTION',
      recommendationText: 'LDL-C of {value} mg/dL combined with elevated blood pressure warrants structured lifestyle intervention: heart-healthy diet (AHA Dietary Guidelines), aerobic exercise 150 min/week, and smoking cessation if applicable. Schedule 3-month follow-up.',
      urgency: 'ROUTINE',
      priority: 50,
    }
  })
  console.log(`✓ Protocol rules: 3 rules created`)

  // ---------------------------------------------------------------------------
  // 5. Two sample patients
  // ---------------------------------------------------------------------------
  const patient1 = await prisma.patient.upsert({
    where: { id: '00000000-0000-4000-8000-000000000020' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000020',
      tenantId: tenant.id,
      organizationId: org.id,
      mrn: 'MRN-DEMO-001',
      firstName: 'Carlos',
      lastName: 'Mendoza',
      dateOfBirth: new Date('1968-04-15'),
      biologicalSex: BiologicalSex.MALE,
    }
  })

  const patient2 = await prisma.patient.upsert({
    where: { id: '00000000-0000-4000-8000-000000000021' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000021',
      tenantId: tenant.id,
      organizationId: org.id,
      mrn: 'MRN-DEMO-002',
      firstName: 'Ana',
      lastName: 'Restrepo',
      dateOfBirth: new Date('1975-09-22'),
      biologicalSex: BiologicalSex.FEMALE,
    }
  })
  console.log(`✓ Patients: ${patient1.firstName} ${patient1.lastName}, ${patient2.firstName} ${patient2.lastName}`)

  // ---------------------------------------------------------------------------
  // 6. Sample observations (trigger auto-snapshot via DB trigger)
  //    LOINC codes used:
  //    2089-1 = LDL Cholesterol      8480-6 = Systolic BP
  //    2085-9 = HDL Cholesterol      8462-4 = Diastolic BP
  //    2093-3 = Total Cholesterol    2345-7 = Fasting Glucose
  // ---------------------------------------------------------------------------
  const observations = [
    // Patient 1 — Carlos: High LDL + Stage 2 HTN → should trigger 2 recommendations
    { patientId: patient1.id, loincCode: '2089-1', displayName: 'LDL Cholesterol',    value: 213.0, unit: 'mg/dL', observedAt: new Date('2024-11-10') },
    { patientId: patient1.id, loincCode: '8480-6', displayName: 'Systolic BP',        value: 148.0, unit: 'mmHg',  observedAt: new Date('2024-11-10') },
    { patientId: patient1.id, loincCode: '8462-4', displayName: 'Diastolic BP',       value: 92.0,  unit: 'mmHg',  observedAt: new Date('2024-11-10') },
    { patientId: patient1.id, loincCode: '2085-9', displayName: 'HDL Cholesterol',    value: 42.0,  unit: 'mg/dL', observedAt: new Date('2024-11-10') },
    { patientId: patient1.id, loincCode: '2093-3', displayName: 'Total Cholesterol',  value: 278.0, unit: 'mg/dL', observedAt: new Date('2024-11-10') },
    // Patient 2 — Ana: Borderline LDL + normal-high BP → lifestyle intervention
    { patientId: patient2.id, loincCode: '2089-1', displayName: 'LDL Cholesterol',    value: 142.0, unit: 'mg/dL', observedAt: new Date('2024-11-12') },
    { patientId: patient2.id, loincCode: '8480-6', displayName: 'Systolic BP',        value: 133.0, unit: 'mmHg',  observedAt: new Date('2024-11-12') },
    { patientId: patient2.id, loincCode: '2085-9', displayName: 'HDL Cholesterol',    value: 68.0,  unit: 'mg/dL', observedAt: new Date('2024-11-12') },
  ]

  for (const obs of observations) {
    await prisma.clinicalObservation.create({
      data: {
        tenantId:    tenant.id,
        patientId:   obs.patientId,
        loincCode:   obs.loincCode,
        displayName: obs.displayName,
        valueNumeric: obs.value,
        unit:         obs.unit,
        sourceSystem: ObservationSource.MANUAL_ENTRY,
        observedAt:  obs.observedAt,
      }
    })
  }
  console.log(`✓ Observations: ${observations.length} records`)
  console.log(`\n✅ Seed complete. PatientHealthSnapshot rows will be created by DB trigger.`)
  console.log(`\nNext step: run the RiskScore computation service and Protocol evaluation engine.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

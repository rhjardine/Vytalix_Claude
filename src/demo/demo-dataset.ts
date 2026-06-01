// =============================================================================
// FROZEN DEMO DATASET — Vytalix Clinical Intelligence Engine
//
// REGLA ABSOLUTA: Este archivo define verdades inmutables del demo.
// - Nunca leer de variables de entorno dinámicas para IDs o valores clínicos.
// - Nunca generar UUIDs aleatorios (todos están fijos aquí).
// - Nunca usar Date.now() para fechas de observaciones (todas fijas).
// - Si este archivo cambia → el demo:check FALLARÁ hasta que se re-sincronice.
//
// Cada vez que se ejecuta el seed con este dataset, el resultado es IDÉNTICO.
// Esto hace posible validar el demo programáticamente.
// =============================================================================

export const DEMO = {

  // ── Identidad del tenant (fijo, inmutable) ──────────────────────────────
  TENANT: {
    ID:   'a1b2c3d4-0000-4000-8000-000000000001',
    SLUG: 'grupo-nueve-once',
    NAME: 'Grupo Nueve Once — Red de Salud',
  },

  ORGANIZATION: {
    ID:   'a1b2c3d4-0000-4000-8000-000000000002',
    NAME: 'Clínica de Medicina Preventiva — Sede Principal',
  },

  PHYSICIAN: {
    ID:    'a1b2c3d4-0000-4000-8000-000000000003',
    EMAIL: 'dr.martinez@grupo919.health',
    NAME:  'Dra. Sofía Martínez',
    ROLE:  'PHYSICIAN' as const,
  },

  PROTOCOL: {
    ID:   'a1b2c3d4-0000-4000-8000-000000000004',
    RULE: 'a1b2c3d4-0000-4000-8000-000000000005',
  },

  // ── Paciente principal del demo ──────────────────────────────────────────
  PATIENT_1: {
    ID:             'a1b2c3d4-0000-4000-8000-000000000010',
    MRN:            'GNO-2024-000112',
    FIRST_NAME:     'Roberto',
    LAST_NAME:      'Vargas',
    DATE_OF_BIRTH:  '1968-03-15',        // 56 años
    SEX:            'MALE' as const,
    // Valores esperados post-seed (para validación)
    EXPECTED: {
      RISK_PERCENT:    34.21,
      RISK_CATEGORY:   'HIGH' as const,
      PENDING_ALERTS:  3,
      OBSERVATIONS:    18,               // 3 timepoints × 6 marcadores
      LDL_LATEST:      213.0,
      SYSTOLIC_LATEST: 148.0,
      GLUCOSE_LATEST:  112.0,
      BIO_AGE_DELTA:   7,               // 7 años mayor que cronológica
    },
  },

  // ── Paciente secundario (contraste en lista) ─────────────────────────────
  PATIENT_2: {
    ID:            'a1b2c3d4-0000-4000-8000-000000000011',
    MRN:           'GNO-2024-000089',
    FIRST_NAME:    'Ana',
    LAST_NAME:     'Restrepo',
    DATE_OF_BIRTH: '1975-09-22',        // 49 años
    SEX:           'FEMALE' as const,
    EXPECTED: {
      RISK_CATEGORY:   'LOW' as const,
      PENDING_ALERTS:  0,
      OBSERVATIONS:    4,
    },
  },

  // ── Observaciones de Roberto — 3 timepoints cronológicos ─────────────────
  // T1 = Baseline (hace 6 meses) — valores borderline
  // T2 = Seguimiento (hace 3 meses) — empeoramiento
  // T3 = Actual — umbrales cruzados → genera alertas
  OBSERVATIONS_P1: [
    // T1 — 2024-05-15
    { loincCode: '2089-1', name: 'LDL Cholesterol',    value: 162.0, unit: 'mg/dL', date: '2024-05-15T08:00:00Z', t: 1 },
    { loincCode: '2085-9', name: 'HDL Cholesterol',    value: 44.0,  unit: 'mg/dL', date: '2024-05-15T08:00:00Z', t: 1 },
    { loincCode: '2093-3', name: 'Total Cholesterol',  value: 230.0, unit: 'mg/dL', date: '2024-05-15T08:00:00Z', t: 1 },
    { loincCode: '8480-6', name: 'Systolic BP',        value: 136.0, unit: 'mmHg',  date: '2024-05-15T08:00:00Z', t: 1 },
    { loincCode: '8462-4', name: 'Diastolic BP',       value: 88.0,  unit: 'mmHg',  date: '2024-05-15T08:00:00Z', t: 1 },
    { loincCode: '2345-7', name: 'Fasting Glucose',    value: 105.0, unit: 'mg/dL', date: '2024-05-15T08:00:00Z', t: 1 },
    // T2 — 2024-08-20
    { loincCode: '2089-1', name: 'LDL Cholesterol',    value: 188.0, unit: 'mg/dL', date: '2024-08-20T09:00:00Z', t: 2 },
    { loincCode: '2085-9', name: 'HDL Cholesterol',    value: 43.0,  unit: 'mg/dL', date: '2024-08-20T09:00:00Z', t: 2 },
    { loincCode: '8480-6', name: 'Systolic BP',        value: 142.0, unit: 'mmHg',  date: '2024-08-20T09:00:00Z', t: 2 },
    { loincCode: '8462-4', name: 'Diastolic BP',       value: 91.0,  unit: 'mmHg',  date: '2024-08-20T09:00:00Z', t: 2 },
    { loincCode: '2345-7', name: 'Fasting Glucose',    value: 109.0, unit: 'mg/dL', date: '2024-08-20T09:00:00Z', t: 2 },
    { loincCode: '2093-3', name: 'Total Cholesterol',  value: 254.0, unit: 'mg/dL', date: '2024-08-20T09:00:00Z', t: 2 },
    // T3 — 2024-11-10 (current — thresholds crossed)
    { loincCode: '2089-1', name: 'LDL Cholesterol',    value: 213.0, unit: 'mg/dL', date: '2024-11-10T10:00:00Z', t: 3 },
    { loincCode: '2085-9', name: 'HDL Cholesterol',    value: 42.0,  unit: 'mg/dL', date: '2024-11-10T10:00:00Z', t: 3 },
    { loincCode: '2093-3', name: 'Total Cholesterol',  value: 278.0, unit: 'mg/dL', date: '2024-11-10T10:00:00Z', t: 3 },
    { loincCode: '8480-6', name: 'Systolic BP',        value: 148.0, unit: 'mmHg',  date: '2024-11-10T10:00:00Z', t: 3 },
    { loincCode: '8462-4', name: 'Diastolic BP',       value: 94.0,  unit: 'mmHg',  date: '2024-11-10T10:00:00Z', t: 3 },
    { loincCode: '2345-7', name: 'Fasting Glucose',    value: 112.0, unit: 'mg/dL', date: '2024-11-10T10:00:00Z', t: 3 },
  ] as const,

  // ── Observaciones de Ana — 1 timepoint, valores saludables ───────────────
  OBSERVATIONS_P2: [
    { loincCode: '2089-1', name: 'LDL Cholesterol',  value: 118.0, unit: 'mg/dL', date: '2024-10-05T09:00:00Z' },
    { loincCode: '2085-9', name: 'HDL Cholesterol',  value: 72.0,  unit: 'mg/dL', date: '2024-10-05T09:00:00Z' },
    { loincCode: '8480-6', name: 'Systolic BP',       value: 116.0, unit: 'mmHg',  date: '2024-10-05T09:00:00Z' },
    { loincCode: '2345-7', name: 'Fasting Glucose',  value: 88.0,  unit: 'mg/dL', date: '2024-10-05T09:00:00Z' },
  ] as const,

  // ── Risk score pre-computado ─────────────────────────────────────────────
  RISK_SCORE: {
    ID:            'a1b2c3d4-0000-4000-8000-000000000020',
    VALUE:         0.3421,
    VALUE_PERCENT: 34.21,
    CATEGORY:      'HIGH' as const,
    ALGORITHM_ID:  'framingham_2008_updated',
    ALGORITHM_VER: '1.0.0',
    INPUT_SNAPSHOT: {
      age: 56, totalCholesterol: 278, hdlCholesterol: 42,
      systolicBp: 148, isOnAntihypertensives: false,
      isSmoker: true, hasDiabetes: false, biologicalSex: 'MALE',
    },
  },

  // ── Expectativas de validación global ────────────────────────────────────
  VALIDATION: {
    TOTAL_PATIENTS:      2,
    TOTAL_OBSERVATIONS:  22,             // 18 + 4
    TOTAL_RISK_SCORES:   1,
    TOTAL_DECISIONS:     3,              // H-001, H-002, H-003
    PENDING_DECISIONS:   3,
    URGENT_DECISIONS:    2,              // H-001 SOON, H-002 SOON
    ROUTINE_DECISIONS:   1,              // H-003 ROUTINE
  },

  // ── Demo JWT para requests de prueba ─────────────────────────────────────
  DEMO_TOKEN_PAYLOAD: {
    sub:       'a1b2c3d4-0000-4000-8000-000000000003',
    tenant_id: 'a1b2c3d4-0000-4000-8000-000000000001',
    org_id:    'a1b2c3d4-0000-4000-8000-000000000002',
    role:      'PHYSICIAN',
    email:     'dr.martinez@grupo919.health',
  },
} as const

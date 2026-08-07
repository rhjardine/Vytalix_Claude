# Funnel API Reference

The four endpoints that carry the Phase 1 flow. Every request and response below
was captured from a running server against a real database. Nothing is illustrative.

Base URL: `https://sandbox.api.vytalix.health`
Authentication: **none on these four endpoints today**. Content type:
`application/json`.

Error shape is uniform: RFC 7807 with `type`, `title`, `status`, `detail`,
`correlationId`. Note that `detail` carries **one** message — the first validation
failure, not a list. Fix one field, resend, see the next.

---

## 1 · POST /api/funnel/leads

Registers a lead. Use it at the start if you want the rest of the journey
correlated from first contact; it is optional for the other three calls.

**Required:** `name` (2–200), `email`, `interestType`, `source`,
`consentMarketing`, `consentDataProcessing`
**Optional:** `organization`, `phone`, `country` (2 letters), `message`,
`utmSource`, `utmCampaign`, `referralCode`, `vitalityAssessmentId`,
`facialAnalysisId`

`interestType`: `DEMO_PLATAFORMA` · `INTEGRACION_EMR` · `PARTNERSHIP_CLINICO` ·
`INFORMACION_GENERAL` · `LONGEVIDAD_CLINICA` · `ODONTOLOGIA_LONGEVIDAD` ·
`TURISMO_SALUD`
`source`: `CTA_FORM` · `VITALITY_TEST_RESULT` · `FACIAL_ANALYSIS_RESULT` ·
`CONSULTA_EXPLORATORIA` · `HERO_CTA`

```json
{
  "name": "Kevin Perdomo",
  "email": "kevin@disglobal.test",
  "interestType": "INTEGRACION_EMR",
  "source": "CTA_FORM",
  "consentMarketing": true,
  "consentDataProcessing": true
}
```

**201**

```json
{
  "data": {
    "id": "ef41ee8f-29e5-48f7-9402-0111ca9eb886",
    "status": "NEW",
    "confirmationEmailSent": false
  },
  "meta": {
    "correlationId": "7f787462-3ee9-4636-9a44-bbda131a05e3",
    "timestamp": "2026-08-06T13:57:33.445Z"
  }
}
```

`confirmationEmailSent: false` is expected in sandbox — the notification provider
writes to a log rather than sending mail.

**422 — reproduced**

| Cause | `detail` |
|---|---|
| Malformed email | `Email inválido` |
| Unknown `interestType` | `Invalid enum value. Expected 'DEMO_PLATAFORMA' \| 'INTEGRACION_EMR' \| … , received 'OTRO'` |

Validation messages arrive in Spanish for custom rules and in English for enum
mismatches. Match on `status` and the field, not on the message text.

Persists to `funnel_leads`. Keep `data.id` — it is the `leadId` the other three
endpoints accept.

---

## 2 · POST /api/funnel/facial-analysis

Runs the facial scan. Returns **200**, not 201.

**Required:** `imageBase64` (100 characters minimum, ~2 MB maximum encoded)
**Optional:** `sessionId`, `leadId`

```json
{ "imageBase64": "/9j/4AAQSkZJRgABAQEAYABgAAD…", "sessionId": "dg08a-001" }
```

**200**

```json
{
  "data": {
    "id": "04a66eb7-8318-4611-b66d-e4dbbf7dd007",
    "estimatedAge": 51,
    "confidence": 0.88,
    "analysisPoints": 24,
    "status": "COMPLETED",
    "provider": "mock",
    "analyzedAt": "2026-08-06T13:57:33.703Z"
  },
  "meta": {
    "correlationId": "ea3497cf-de30-40ae-b816-724c7bac59e0",
    "timestamp": "2026-08-06T13:57:33.703Z"
  }
}
```

**`provider` decides whether the number is usable.** With `mock`, `estimatedAge` is
derived from a hash of the image bytes: sending the same image twice returned
`estimatedAge: 51, confidence: 0.88` both times, with different ids. Read
`provider` before showing anything to a user. Detail in
`FACIAL_ANALYSIS_STATUS.md`.

**422 — reproduced**

| Cause | `detail` |
|---|---|
| Under 100 characters | `Imagen inválida o demasiado pequeña` |
| Over ~2 MB encoded | `Imagen demasiado grande — máximo 2MB` *(schema-declared; not reproduced)* |

Images are not retained. Only the derived values above are stored.

---

## 3 · POST /api/funnel/vitality-assessment

Stores a questionnaire result. **Vytalix does not score anything here** — it
persists the values you send and returns an id.

**Required:** `score` (0–100), `category`, `yearsBiological` (18–120),
`chronologicalAgeGroup`, `dimensions` (all five), `answersPayload`, `completedAt`
**Optional:** `durationSeconds`, `deviceType`, `sessionId`, `leadId`

`category`: `EXCELENTE` · `BUENO` · `REGULAR` · `CRITICO`
`chronologicalAgeGroup`: `"45"` · `"59"` · `"69"` · `"78"` — an age bracket, not a
question count
`dimensions`: `energiaEstadoMental`, `suenoCognicion`, `composicionCorporal`,
`signosEnvejecimiento`, `rangoEdad`, each 0–100

```json
{
  "score": 72,
  "category": "BUENO",
  "yearsBiological": 47,
  "chronologicalAgeGroup": "45",
  "dimensions": {
    "energiaEstadoMental": 70,
    "suenoCognicion": 65,
    "composicionCorporal": 80,
    "signosEnvejecimiento": 75,
    "rangoEdad": 70
  },
  "answersPayload": { "q1": true, "q2": false, "q3": true },
  "completedAt": "2026-08-05T10:00:00.000Z",
  "durationSeconds": 480,
  "deviceType": "mobile"
}
```

**201**

```json
{
  "data": { "id": "8f32f789-23c9-4a2b-b4ca-d4f18652399e" },
  "meta": {
    "correlationId": "19286d87-a379-48e7-858d-84b18884a4c6",
    "timestamp": "2026-08-06T13:57:33.903Z"
  }
}
```

Only the id comes back. Whatever you display to the user is what you computed.

**422 — reproduced**

| Cause | `detail` |
|---|---|
| Unknown `category` | `Invalid enum value. Expected 'EXCELENTE' \| 'BUENO' \| 'REGULAR' \| 'CRITICO', received 'MUY_BUENO'` |
| `dimensions` absent | `Required` — the message does not name the field |

That second case is worth planning for: a missing required object produces a bare
`Required`. Validate your payload client-side rather than relying on the message.

`answersPayload` is `Record<string, boolean>` with no length limit, so 45 questions
fit without a schema change. Persists to `vitality_assessments`.

---

## 4 · POST /api/funnel/booking

Requests a consultation. Read the response section before designing this step — it
does not behave like a booking API.

**Required:** `name` (2–200), `email`, `consultationType`
**Optional:** `phone`, `specialistPreference`, `preferredDate` (`YYYY-MM-DD`),
`preferredTime`, `timezone`, `vitalityScore`, `vitalityCategory`, `chiefConcern`,
`leadId`, `sessionId`

`consultationType`: `EXPLORATORIA_LONGEVIDAD` · `EXPLORATORIA_DENTAL` ·
`EXPLORATORIA_PREVENTIVA` · `SEGUNDA_OPINION`
`specialistPreference`: `longevity` · `dental` · `preventive` · `any`
`preferredTime`: `morning` · `afternoon` · `evening`

```json
{
  "name": "Kevin Perdomo",
  "email": "kevin@disglobal.test",
  "consultationType": "EXPLORATORIA_LONGEVIDAD",
  "specialistPreference": "longevity",
  "preferredDate": "2026-08-20",
  "preferredTime": "morning",
  "timezone": "America/Caracas"
}
```

**201**

```json
{
  "data": {
    "id": "122e183f-a5ae-48be-8cba-9b5576f0f6f8",
    "status": "WHATSAPP_ONLY",
    "confirmationCode": "VYT5YHB2I",
    "confirmationChannel": "WHATSAPP",
    "whatsappFallbackUrl": "https://wa.me/58412XXXXXXX?text=Hola!%20Soy%20Kevin%20Perdomo…",
    "nextSteps": [
      "Tu código de consulta es: VYT5YHB2I",
      "Toca el botón de WhatsApp para confirmar tu cita con nuestro equipo",
      "Un especialista te contactará en menos de 24 horas hábiles",
      "Guarda este código — lo necesitarás para tu primera consulta"
    ]
  },
  "meta": {
    "correlationId": "bb84c063-aacc-491f-b667-def08a876882",
    "timestamp": "2026-08-06T13:57:34.099Z"
  }
}
```

### Two things this endpoint does not do

**It does not schedule.** `status: WHATSAPP_ONLY` means the request is recorded and
handed to a human: the user is expected to open `whatsappFallbackUrl` and confirm
with the team, quoting `confirmationCode`. `preferredDate` and `preferredTime` are
captured as preferences, not reserved. There is no calendar, no slot, no
confirmation callback. Surface `confirmationCode` and the WhatsApp link in your UI
or the journey stops here.

**It cannot express online versus in person.** `consultationType` describes the
*subject* of the consultation (longevity, dental, preventive, second opinion), not
its modality. No field in this schema distinguishes an online consult from an
in-person one.

A `bookingType` enum with `ONLINE_CONSULT` / `IN_PERSON` / `LAB_PANEL` exists
elsewhere in the codebase, but it belongs to a service module this endpoint does
not use — sending `bookingType` returns `422 Required`, because `consultationType`
is still missing. If the online/in-person split matters for Phase 1, raise it:
today it needs either a workaround on your side or a change on ours.

**422 — reproduced**

| Cause | `detail` |
|---|---|
| Unknown `consultationType` | `Invalid enum value. Expected 'EXPLORATORIA_LONGEVIDAD' \| 'EXPLORATORIA_DENTAL' \| 'EXPLORATORIA_PREVENTIVA' \| 'SEGUNDA_OPINION', received 'ONLINE'` |
| `consultationType` absent | `Required` |

---

## Notes for the integrator

**Ordering.** The four are independent. Create a lead first only if you want
`leadId` threading through the rest.

**Correlation.** Every response carries `meta.correlationId`, and the header
`X-Correlation-ID` mirrors it. Send your own header value and it is echoed. Log it.

**Verified persistence.** `funnel_leads` and `vitality_assessments` each received a
row during this capture. Facial results returned ids and completed cleanly. The
booking response returned an id, but `funnel_bookings` held no rows afterwards —
bookings are recorded on a different path than the table name suggests. If you need
to reconcile bookings against our records, ask before you build against an
assumption.

**Not validated here.** Payloads at the 2 MB image boundary, concurrent submissions
for the same `leadId`, and behaviour under load. Nothing in this document describes
untested behaviour.

# DG Integration Checklist

Pre-kickoff verification. Every line is something that can be observed as done or
not done. Owner is whoever performs the check, not who is responsible for the
work behind it.

---

## Credentials delivered

- [ ] API Key delivered out of band (not by email body, ticket, or repository) — *Vytalix*
- [ ] HMAC webhook secret delivered out of band — *Vytalix*
- [ ] Scope list for the issued key confirmed in writing — *Vytalix*
- [ ] Rate limit tier and monthly quota agreed for the expected volume — *both*
- [ ] Credentials loaded into Disglobal's secret manager — *Disglobal*

## Environment reachable

- [ ] Sandbox base URL confirmed and reachable from Disglobal's network — *Disglobal*
- [ ] `GET /liveness` returns `200` — *Disglobal*
- [ ] Test `subjectRef` provisioned in the sandbox tenant — *Vytalix*

## Artefacts received

- [ ] `openapi/vytalix-platform-v2.yaml` received and imported — *Disglobal*
- [ ] Postman collection received and `base_url` + `X-API-Key` variables set — *Disglobal*
- [ ] `QUICK_START.md`, `FAQ.md`, `KNOWN_LIMITATIONS.md` received — *Disglobal*
- [ ] Webhook signing examples (`.sh` and `.js`) received — *Disglobal*

## First calls succeed

- [ ] `GET /api/v2/insights/cohort` returns `200` with the delivered key — *Disglobal*
- [ ] A request with no `X-API-Key` returns `401` (negative control) — *Disglobal*
- [ ] `POST /api/v2/vitality/assess` returns `200` for the test `subjectRef` — *Disglobal*
- [ ] Postman collection run completes with no unexpected failures — *Disglobal*

## Webhook verified

- [ ] Disglobal can reach `POST /api/v2/webhooks/payment` on the sandbox — *Disglobal*
- [ ] A correctly signed webhook returns `200` — *Disglobal*
- [ ] A tampered signature returns `401` (negative control) — *Disglobal*
- [ ] Replaying the same `intentId` returns `200` with `"replayed": true` — *Disglobal*

## Operations agreed

- [ ] Support contact and escalation path exchanged — *both*
- [ ] Both sides agree to log and quote `X-Correlation-ID` on any incident — *both*
- [ ] Retry policy for `5xx` agreed (backoff, max attempts) — *both*

# Vytalix × Disglobal — FAQ

Questions that come up while building the consumer. Each answer reflects the
behaviour of the platform as shipped, not an intention.

---

### Do I need the SDK?

No. Phase 1 is plain REST over the OpenAPI contract, and that is the supported
path. A TypeScript client exists as **reference source** (`disglobal-client.ts`,
class `DisgglobalVytalixClient`) but it is not published as an npm package, so
treat any `npm i @vytalix/disglobal-sdk` instruction in older docs as not yet
available. Generate your own client from the OpenAPI file.

### Which environment variable name should I use for the key?

Use `VYTALIX_API_KEY`. You may see `VYX_API_KEY` in some examples — it is the same
value under a legacy alias. Only the `X-API-Key` **header name** matters to us.

### What is a `subjectRef` and who creates it?

It is your pseudonymous reference for a user — never send us a real identity. We
resolve it against the patient record on our side, so a `subjectRef` must exist
in your tenant before an assessment referencing it will succeed; otherwise you
get `404`. For the sandbox we seed one for you. In production, tell us how you
want subjects created and we agree the flow before go-live.

### Can I send `patientId` instead of `subjectRef`?

Yes. `/api/v2/vitality/assess` accepts either one; supply exactly one of them.
`patientId` must be a UUID we issued.

### Why does `/api/v2/insights/cohort` return `cohortTooSmall`?

By design. Population metrics are withheld until the cohort reaches 50 subjects,
so a small sandbox always returns that flag. It is a `200`, not an error.

### What happens if I retry a payment webhook?

Nothing bad. Deduplication is enforced in the database on `intentId`. A replay
returns `200` with `"replayed": true`, and the service is never activated twice
nor the patient notified twice. Retrying after a `500` or a timeout is always the
correct move.

### I get `401` on the webhook but my secret is right.

The digest is computed over the *canonical* body: keys `event, intentId, amount,
currency, timestamp, subjectRef, metadata`, in that exact order, compact JSON, and
`signature` excluded. Pretty-printing, reordering, or adding a field changes the
digest. Compare against `examples/send-payment-webhook.sh`, which is the
authoritative implementation.

### Does a `200` on the webhook mean the payment is safely stored?

Yes. We answer `200` only after the database transaction commits. If persistence
fails you get `500` and we publish no event — which is your signal to retry.

### What does `X-Idempotency-Key` do on `/api/v2` calls?

If you send one, we cache the response for 24h and replay it for an identical key
instead of recomputing. It is optional, and independent of the webhook's
`intentId` deduplication.

### `401` and `403` — what is the difference?

`401` means we could not authenticate the key (missing, invalid, expired or
revoked — deliberately indistinguishable). `403` means the key is valid but does
not carry the scope for that endpoint. Neither should be retried in a loop.

### How do I get a new API key, or rotate one?

Ask us. Key provisioning is an internal Vytalix operation behind an authenticated
administrative endpoint — it is not self-service, by design. Keys are stored only
as a SHA-256 hash, so a lost key cannot be recovered, only replaced.

### Are there rate limits?

Your key carries a rate limit tier and an optional monthly quota. When either is
exceeded you receive `429`. Tell us your expected volume and we set the tier
accordingly before kickoff.

### What do I log for support?

`X-Correlation-ID` from the response headers, plus `correlationId` in any error
body. That is what lets us find your exact request on our side.

### Is the funnel API (`/api/funnel/*`) available to me?

No. It is outside Phase 1 and inactive for partners. The same applies to the
dental endpoints and the outbound (asynchronous) referral webhook — use the
synchronous `GET /api/v2/referral/{subjectRef}` instead.

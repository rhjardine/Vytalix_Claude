# Payment and Notification Flow — Phase 1

> **Scope note.** Everything under "Technically confirmed" was verified against the
> code and against a running server. Everything under "Pending business decision"
> is **open** — it is listed because it is not settled, not because a position has
> been taken. No commercial agreement is represented here as decided.

---

## Responsibility split

```
  USER ──pays──▶ DISGLOBAL ──HMAC webhook──▶ VYTALIX ──▶ activation + notification
                (charges,                   (verifies,
                 owns PSP)                   persists,
                                             activates)
```

| Question | Answer | Status |
|---|---|---|
| Who generates the payment? | **Disglobal** — its own rails and PSP. Vytalix never touches card data | ✅ Confirmed |
| Who confirms it? | **Disglobal**, on its side, before notifying us | ✅ Confirmed |
| Who receives the webhook? | **Vytalix** — `POST /api/v2/webhooks/payment` | ✅ Confirmed |
| What event does it fire? | `PaymentConfirmed`, published **after** the database commit | ✅ Confirmed |
| Does Vytalix call Disglobal back? | **No. No outbound callback exists** | 🔶 Pending |

---

## Technically confirmed

### Authentication — HMAC-SHA256, not an API Key
The signature is the hex HMAC of the **canonical** body: these keys, in this order,
compact JSON, `signature` excluded:

```
event, intentId, amount, currency, timestamp, subjectRef, metadata
```

Comparison is timing-safe. Any deviation in order or whitespace produces a
different digest and returns `401`. Reference implementations:
`examples/send-payment-webhook.sh` and `.js` — both verified to produce identical
digests for identical input.

### Transactional guarantee
`200` is returned **only after the database COMMIT succeeds**.

| Response | What actually happened | Your action |
|---|---|---|
| `200` `replayed:false` | Persisted and durable | Continue |
| `200` `replayed:true` | This `intentId` was already recorded | Nothing — safe |
| `401` | Signature rejected | Fix signing; nothing recorded |
| `500` | **Nothing recorded** | **Retry the same request** |
| timeout | Unknown | Resend the same `intentId`; `replayed` tells you which happened |

### Idempotency
Deduplication is **database-authoritative** on `intentId` (`UNIQUE` + `ON CONFLICT
DO NOTHING RETURNING id`). It is always on and cannot be disabled. A replay yields
no new row, so no re-activation and no re-notification. Retries are safe by
construction.

### What `PaymentConfirmed` triggers
Published post-commit, best-effort. Three effects, **none of which can change your
HTTP result**:

1. **Service access activation** — a durable flag keyed to the subject and product.
2. **Patient notification** — non-blocking; failure never blocks activation.
3. **Appointment booking notification** — non-blocking.

If a side effect fails, the payment record stands and a reconciliation sweep
re-publishes the event. You never need to compensate for a `200`.

### Event semantics
| `event` value | Behaviour |
|---|---|
| `payment.confirmed` | Persists, activates, notifies |
| `payment.failed` | Acknowledged with `200`, **no side effects** |
| `payment.refunded` | Acknowledged with `200`, **no side effects** |

Only `payment.confirmed` performs work today.

### Sandbox notification behaviour
The sandbox runs the **`log` notification provider**: notifications are written to
the platform log, and **no real email or SMS is delivered**. Do not use the sandbox
to validate message delivery, copy, or channel. Only the activation path is
observable there.

---

## Pending business decision

None of these is a technical defect. Each needs a commercial answer before
production, and each has a concrete technical consequence.

| # | Open question | Technical consequence today |
|---|---|---|
| B1 | **Does Disglobal expect a confirmation callback from Vytalix?** | **Nothing is built.** There is no outbound webhook to Disglobal — verified by inspection. If it is expected, it is new scope with its own contract |
| B2 | Who charges the end user, and what is the revenue split? | Vytalix records `amount` and `currency` as reported by Disglobal. It performs no reconciliation against a commercial agreement |
| B3 | Refund policy | `payment.refunded` is acknowledged but produces no effect — it does **not** deactivate service access. A refund today leaves access active |
| B4 | Which `product` values are valid? | `metadata.product` is **free-form**; an unknown value is stored as-is (missing → `UNKNOWN`). No SKU catalogue is enforced. Agreeing the vocabulary avoids silent divergence |
| B5 | Who owns scheduling after activation? | No Phase 1 endpoint covers booking. The notification fires; the booking surface is undefined |
| B6 | Expected volume and throttling | The key records a `rateLimitTier`, but tier throttling and monthly quota are **not enforced** in this environment. No `429` will signal volume |
| B7 | Currency and minor-unit convention per market | `amount` is an integer in minor units. Multi-currency behaviour is not specified beyond that |

> **On the source of this list:** it was derived from the repository — from what the
> code does and does not do — not from a commercial conversation. If points were
> already settled verbally with Kevin, they should be written down and this table
> corrected; the intent here is to surface the gaps, not to assert positions.

---

## Recommended first payment test

1. Run `examples/send-payment-webhook.sh` unmodified. Expect `200` `replayed:false`.
2. Run it again **without changing `intentId`**. Expect `200` `replayed:true`.
3. Alter one character of the signature. Expect `401`.

Those three results confirm signing, durability and idempotency — the whole
contract. Do it before writing your own signer.

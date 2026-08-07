# Partner Security Handoff

How credentials reach Disglobal, and how they are withdrawn. Applies to both sides.

---

## What is being handed over

| Credential | Used for | Sensitivity |
|---|---|---|
| **API Key** | `X-API-Key` on six Phase 1 endpoints | High — grants data access under a tenant |
| **Webhook secret** | HMAC signing of payment confirmations | High — forges payment confirmations if leaked |
| Sandbox base URL | routing | Low |
| `subjectRef` | test subject reference | Low — a synthetic identifier |

The two high-sensitivity values are what this document is about.

---

## Never

| Prohibited | Why |
|---|---|
| **API keys over WhatsApp / Telegram / SMS** | No revocation, no audit, no expiry. Backed up to personal devices and cloud accounts outside both companies |
| **Secrets in an email body** | Emails are forwarded, archived indefinitely, and indexed by mail providers. Deleting the message does not recall the copies |
| **A shared repository** | Anything committed lives in history forever. Rewriting history does not remove it from clones or forks |
| **A ZIP containing credentials** | Travels as an opaque blob with no expiry and no access log. Gets re-shared unopened |
| **Both credentials through the same channel** | One compromised channel then yields the complete pair |
| Screenshots or meeting-chat pastes | Same problems, plus recording and transcription |

---

## How to do it

### 1. Use a secret manager
A named share in 1Password, Bitwarden or an equivalent, with **an expiry date**.
This gives all four properties at once: named access, expiry, revocation, audit
trail.

**If neither side has one available**, a single-use self-destructing secret link is
an acceptable substitute, provided you:
- confirm receipt through a **different** channel (a call, not a message), and
- treat the link as burned once opened, whether or not the recipient got it.

### 2. Split the two credentials across channels
API Key through the secret manager; webhook secret through the one-time link — or
the reverse. Never both by the same route. A single compromised channel must not
hand over the pair.

### 3. Nominal access, never a group
The share goes to **Kevin Perdomo by name**, not to a distribution list, a shared
inbox, or a team channel. If a second engineer needs access, issue a **second key**
rather than forwarding the first. Two keys can be revoked independently; a
forwarded key cannot be attributed.

### 4. Set an expiry from the start
Sandbox credentials for a first integration should expire in **30 days**, renewable.
An unbounded credential is a credential nobody will ever remember to revoke.

### 5. Log the handover
Record, outside the credential itself: who issued it, to whom, when, through which
channel, its scopes, and its expiry. This is what makes a later rotation
straightforward instead of archaeological.

---

## Lifecycle — what exists today

| Operation | Mechanism | Notes |
|---|---|---|
| **Create tenant** | SQL / seed script. **No API endpoint** | Internal operation |
| **Issue API Key** | `POST /admin/tenants/{tenantId}/api-keys` | Requires a JWT with role `ORG_ADMIN`. **Not self-service** — the partner cannot mint their own |
| **Assign scopes** | `permissions` field in the same request | Grant only the six Phase 1 scopes. Nothing broader |
| **Revoke** | `DELETE /admin/tenants/{tenantId}/api-keys/{keyId}` | Immediate |
| **Rotate** | **No rotation endpoint.** Rotation = issue new, hand over, then revoke old | Sequence in that order to avoid a gap |

**The key is shown exactly once.** It is stored only as a SHA-256 hash, so a lost
key cannot be recovered — only replaced. Do not plan on retrieving it later.

---

## If a credential leaks

1. **Revoke immediately** — `DELETE` the key. Do not wait to confirm the leak.
2. **Rotate the webhook secret** if that is what leaked; every signature made with
   the old one stops verifying.
3. Issue a replacement through a clean channel, and record the incident in the
   handover log.
4. Review what the key could reach: the six Phase 1 scopes, scoped to one tenant.
   It cannot issue further credentials — the administrative surface requires a
   separate authenticated session.

Assume a leaked credential was used. Revoking is cheap; investigating first is not.

---

## For Disglobal — your side

- Load both values into your own secret manager or CI secret store. **Never** into
  source control, a `.env` committed by accident, or a client-side bundle.
- The API Key is a **server-side** credential. It must never appear in browser or
  mobile app code, where it is trivially extractable.
- Do not paste credentials into issue trackers, support tickets, or chat when
  reporting a problem. Send the **`X-Correlation-ID`** instead — that is all we need
  to trace a request.
- Tell us when an engineer with access leaves the project. We will rotate.

# AWS_REKOGNITION_STAGING.md
> **Vytalix — AWS Rekognition staging validation runbook (P1-C · Objetivo 2)**

Operational reference to run the **real** AWS Rekognition validation in staging.
No secrets are committed here — credentials are supplied via the environment only.

## 1. IAM least-privilege policy (attach to a staging-only IAM role/user)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "VytalixFacialAnalysisDetectFacesOnly",
      "Effect": "Allow",
      "Action": ["rekognition:DetectFaces"],
      "Resource": "*"
    }
  ]
}
```

**Only** `rekognition:DetectFaces`. Do NOT grant: full Rekognition, S3, IAM admin,
CloudFormation, or any wildcard action. Prefer a short-lived IAM **role** (STS)
over a long-lived user.

## 2. Environment variables (never versioned)

```
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<staging-only>
AWS_SECRET_ACCESS_KEY=<staging-only>
REKOGNITION_TIMEOUT_MS=5000
VISION_PROVIDER=aws
# test fixtures (base64 of real photos — supplied by the operator, not committed):
AWS_TEST_FACE_IMAGE_B64=<base64 photo WITH a face>
AWS_TEST_NOFACE_IMAGE_B64=<base64 photo WITHOUT a face>
```

Credentials resolve through the AWS SDK default chain (env / IAM role); the code
never reads or logs `AWS_SECRET_ACCESS_KEY`.

## 3. Run the real integration suite

```
RUN_AWS_INTEGRATION=true \
AWS_REGION=us-east-1 \
AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \
AWS_TEST_FACE_IMAGE_B64=... AWS_TEST_NOFACE_IMAGE_B64=... \
npx vitest run tests/facial-analysis.aws.integration.test.ts
```

Cases: (1) valid face → `provider=aws` + `estimatedAge`/`confidence` + latency
< 5s; (2) no face → `422`; (3) corrupt image → controlled `422/502/504` with no
AWS-internal leak. Without `RUN_AWS_INTEGRATION`+creds the suite **skips**.

## 4. Privacy invariant (enforced)

`facial_analyses` stores only: `imageHash` (SHA-256), `estimatedAge`,
`confidence`, `analysisPoints`, `provider`, `status`, `analyzedAt`, ids.
It stores **no** raw image / base64 / binary / embedding / face_vector. The
image bytes are never persisted and never logged.

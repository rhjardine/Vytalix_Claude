# AEK Phase 2 — Sprint A

Standalone Architecture Analysis Engine for ADR-002 dependency import checks.

## File tree

```text
tools/aek/
├── package.json
├── tsconfig.json
├── src/
│   ├── cli/
│   │   └── index.ts
│   ├── core/
│   │   ├── types.ts
│   │   ├── rule-engine.ts
│   │   └── analysis-context.ts
│   ├── analyzers/
│   │   └── dependency-graph/
│   │       ├── dependency-graph-builder.ts
│   │       ├── import-resolver.ts
│   │       └── graph-types.ts
│   ├── rules/
│   │   └── adr-002/
│   │       ├── rule-di-001.ts
│   │       ├── rule-di-002.ts
│   │       └── rule-di-003.ts
│   └── reporters/
│       └── json-reporter.ts
└── README.md
```

## Installation

```bash
cd tools/aek
pnpm install
```

## Usage

From `tools/aek`:

```bash
pnpm aek:analyze
```

The CLI auto-detects the repository root by walking up to `.git` and writes:

```text
.aek/report.json
```

Optional flags:

```bash
pnpm aek:analyze -- --root ../.. --out ../../.aek/report.json
```

## Architecture Gate

The gate compares actual findings against a declared baseline to produce a binary PASS/FAIL signal.

| File | Purpose |
|---|---|
| `.aek/baseline.json` | Declares the maximum allowed findings (`expectedFindings`) |
| `.aek/report.json` | Written by `aek:analyze`; contains the actual findings |

**Run the gate:**

```bash
# From repo root
pnpm aek:check

# Or directly from tools/aek
pnpm aek:analyze
```

A single unified CLI (`dist/cli/index.js`) runs the full flow in order: dependency analysis → rule engine → baseline check → final exit code. Both `aek:check` (root) and `aek:analyze` (tools/aek) execute this exact same flow, so there is zero divergence. The exit code reflects the gate result — not whether findings exist.

**PASS/FAIL criteria:**

```
actual findings <= expectedFindings  →  PASS  (exit 0)
actual findings >  expectedFindings  →  FAIL  (exit 1)
```

**Raising the baseline** (document the exemption before committing):

```json
{ "expectedFindings": 2 }
```

**Tightening the baseline** (after resolving technical debt):

```json
{ "expectedFindings": 0 }
```

---

## Example report

```json
{
  "timestamp": "2026-06-19T00:00:00.000Z",
  "rules": [
    {
      "id": "RULE-DI-001",
      "adr": "ADR-002",
      "description": "External modules must use approved dental barrel exports instead of importing dental internals directly."
    }
  ],
  "findings": [
    {
      "ruleId": "RULE-DI-001",
      "adr": "ADR-002",
      "severity": "error",
      "message": "External module imports dental internals directly; use the approved dental barrel export.",
      "from": "src/example.ts",
      "to": "src/dental/internal/service.ts"
    }
  ]
}
```

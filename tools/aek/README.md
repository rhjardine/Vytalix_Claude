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

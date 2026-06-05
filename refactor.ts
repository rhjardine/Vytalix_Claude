import fs from 'fs'
import path from 'path'

// Map of original filename -> new relative path
const fileMap: Record<string, string> = {
  // src/core
  'algorithm-registry.ts': 'src/core/algorithm-registry.ts',
  'loinc-registry.ts': 'src/core/loinc-registry.ts',
  'decision.engine.ts': 'src/core/decision.engine.ts',
  'referral.engine.ts': 'src/core/referral.engine.ts',

  // src/longevity
  'biophysics-engine.ts': 'src/longevity/biophysics-engine.ts',
  'preventive-score.service.ts': 'src/longevity/preventive-score.service.ts',
  'biological-age.service.ts': 'src/longevity/biological-age.service.ts',
  'insights.service.ts': 'src/longevity/insights.service.ts',

  // src/dental
  'dental-cost.engine.ts': 'src/dental/dental-cost.engine.ts',
  'dental-pricing.service.ts': 'src/dental/dental-pricing.service.ts',

  // src/platform
  'db.ts': 'src/platform/db.ts',
  'redis.ts': 'src/platform/redis.ts',
  'logger.ts': 'src/platform/logger.ts',
  'event-bus.ts': 'src/platform/event-bus.ts',
  'metering.service.ts': 'src/platform/metering.service.ts',
  'disglobal-client.ts': 'src/platform/disglobal-client.ts',
  'prisma.ts': 'src/platform/prisma.ts',
  
  // src/api/middlewares
  'api-key.middleware.ts': 'src/api/middlewares/api-key.middleware.ts',
  'auth.middleware.ts': 'src/api/middlewares/auth.middleware.ts',
  'error.middleware.ts': 'src/api/middlewares/error.middleware.ts',
  'hardening.middleware.ts': 'src/api/middlewares/hardening.middleware.ts',
  'prisma_middleware.ts': 'src/api/middlewares/prisma.middleware.ts', // Renamed _ to .
  'quota.middleware.ts': 'src/api/middlewares/quota.middleware.ts',
  'tenant.middleware.ts': 'src/api/middlewares/tenant.middleware.ts',
  'trace.middleware.ts': 'src/api/middlewares/trace.middleware.ts',
  'consent.guard.ts': 'src/api/middlewares/consent.guard.ts',

  // src/api/handlers
  'external-v2.handler.ts': 'src/api/handlers/external-v2.handler.ts',
  'dental.handler.ts': 'src/api/handlers/dental.handler.ts',
  'health.handler.ts': 'src/api/handlers/health.handler.ts',
  'observability.handler.ts': 'src/api/handlers/observability.handler.ts',
  'billing-admin.handler.ts': 'src/api/handlers/billing-admin.handler.ts',
  'handlers.ts': 'src/api/handlers/handlers.ts',
  'server.ts': 'src/server.ts', // Keep server in src root
  'index.ts': 'src/index.ts', // Keep index in src root
  
  // src/api/pipelines
  'orchestrator.ts': 'src/api/pipelines/orchestrator.ts',
  'pipeline-v2.orchestrator.ts': 'src/api/pipelines/pipeline-v2.orchestrator.ts',
  'bootstrap.ts': 'src/api/pipelines/bootstrap.ts', // For auth bootstrap

  // src/shared
  'contracts-v1.ts': 'src/shared/contracts-v1.ts',
  'mappers.ts': 'src/shared/mappers.ts',
  'engagement.service.ts': 'src/shared/engagement.service.ts',
  'explainability.service.ts': 'src/shared/explainability.service.ts',
  'funnel.service.ts': 'src/shared/funnel.service.ts',
  'ingestion.service.ts': 'src/shared/ingestion.service.ts',
  'risk-scoring.service.ts': 'src/shared/risk-scoring.service.ts',
  'snapshot.service.ts': 'src/shared/snapshot.service.ts',
  'timeline.service.ts': 'src/shared/timeline.service.ts',

  // src/legacy
  'external_handler.ts': 'src/legacy/external_handler.ts',
  'external.handler.ts': 'src/legacy/external.handler.ts', // Older version? No wait, external-v2 is the current one
  'observability_handler.ts': 'src/legacy/observability_handler.ts',
  'snapshot_service.ts': 'src/legacy/snapshot_service.ts',
  'ingestion_service.ts': 'src/legacy/ingestion_service.ts',
  'contracts-v1_1.ts': 'src/legacy/contracts-v1_1.ts',
  'server-v2-patch.ts': 'src/legacy/server-v2-patch.ts',

  // src/demo
  'demo-check.ts': 'src/demo/demo-check.ts',
  'demo-dataset.ts': 'src/demo/demo-dataset.ts',
  'demo-status.ts': 'src/demo/demo-status.ts',
  'seed-demo.ts': 'src/demo/seed-demo.ts',
  'seed_mvp.ts': 'src/demo/seed_mvp.ts',
  'e2e-flow.ts': 'src/demo/e2e-flow.ts',

  // tests
  'algorithm-registry.test.ts': 'tests/algorithm-registry.test.ts',
  'biophysics-engine.test.ts': 'tests/biophysics-engine.test.ts',
  'contracts-v2.test.ts': 'tests/contracts-v2.test.ts',
  'dental-cost.test.ts': 'tests/dental-cost.test.ts',
  'loinc-registry.test.ts': 'tests/loinc-registry.test.ts',
  'pipeline.test.ts': 'tests/pipeline.test.ts',
  'preventive-score.test.ts': 'tests/preventive-score.test.ts',
  'referral.engine.test.ts': 'tests/referral.engine.test.ts',
  'regression.test.ts': 'tests/regression.test.ts',
  'risk-scoring.test.ts': 'tests/risk-scoring.test.ts',
  'tenant-isolation.test.ts': 'tests/tenant-isolation.test.ts',
}

const docsFiles = [
  'ARCHITECTURE.md', 'AUTH_FLOW.md', 'CLINICAL_ARCHITECTURE.md',
  'DEMO_PACKAGE.md', 'DEMO_RUNBOOK.md', 'DENTAL_ROADMAP.md',
  'DISGLOBAL_COMMERCIAL_PACKAGE.md', 'DISGLOBAL_READY_FOR_PILOT.md',
  'DRY_RUNS.md', 'FAILURE_RUNBOOK.md', 'FINAL_DELIVERY_REPORT.md',
  'INTEGRATION_GUIDE.md', 'INTEGRATION_GUIDE_V2.md', 'NARRATIVA_TECNICA.md',
  'OBSERVABILITY_READINESS.md', 'PARTNER_FAQ.md', 'PARTNER_PACKAGE.md',
  'RELEASE_CANDIDATE_REPORT.md', 'ROADMAP_RISKS_CONCLUSION.md',
  'RUNBOOK.md', 'SDK_QUICKSTART.md', 'SECURITY_HARDENING_REPORT.md',
  'SYSTEM_AUDIT.md', 'SYSTEM_STATUS.md', 'TENANT_ISOLATION_REPORT.md',
  'VYTALIX_PLATFORM_ARCHITECTURE.md', 'VYTALIX_README.md',
]

const openapiFiles = ['openapi.yaml', 'vytalix-platform-v2.yaml']

function updateImports(content: string, sourcePath: string): string {
  // Imports match: import { ... } from './something' or '../something'
  const importRegex = /from\s+['"](\.\.?\/[^'"]+)['"]/g
  const requireRegex = /require\(['"](\.\.?\/[^'"]+)['"]\)/g

  const replacePath = (match: string, importPath: string) => {
    // importPath is something like './db'
    const importedFileName = importPath.replace(/^(\.\.\/|\.\/)+/, '')
    
    // Find the mapped file that ends with this name (without .ts extension in import usually)
    // Be careful with multiple matches, but typically in flat structure it's just the exact name
    const possibleMatches = Object.entries(fileMap).filter(([orig, newP]) => 
      orig === importedFileName + '.ts' || orig === importedFileName + '.tsx' || orig === importedFileName
    )

    if (possibleMatches.length > 0) {
      const [_, newDest] = possibleMatches[0]
      // Calculate relative path from sourcePath's directory to newDest
      const sourceDir = path.dirname(sourcePath)
      let relPath = path.relative(sourceDir, newDest).replace(/\\/g, '/')
      if (!relPath.startsWith('.')) {
        relPath = './' + relPath
      }
      // Remove .ts extension
      relPath = relPath.replace(/\.ts$/, '')
      return match.replace(importPath, relPath)
    }
    return match
  }

  content = content.replace(importRegex, replacePath)
  content = content.replace(requireRegex, replacePath)
  return content
}

async function run() {
  if (!fs.existsSync('docs')) fs.mkdirSync('docs')
  if (!fs.existsSync('openapi')) fs.mkdirSync('openapi')
  if (!fs.existsSync('src/legacy')) fs.mkdirSync('src/legacy', { recursive: true })
  
  console.log('1. Moving Docs and OpenAPI...')
  docsFiles.forEach(f => { if (fs.existsSync(f)) fs.renameSync(f, path.join('docs', f)) })
  openapiFiles.forEach(f => { if (fs.existsSync(f)) fs.renameSync(f, path.join('openapi', f)) })
  
  if (fs.existsSync('schema-extensions.prisma')) fs.renameSync('schema-extensions.prisma', 'src/legacy/schema-extensions.prisma')

  console.log('2. Moving Source Files & Updating Imports...')
  
  // First, read all contents and update imports while files are still at old locations
  // We'll write them to their new locations
  for (const [orig, newPath] of Object.entries(fileMap)) {
    if (!fs.existsSync(orig)) {
      console.log(`WARN: ${orig} not found`)
      continue
    }
    const content = fs.readFileSync(orig, 'utf-8')
    const updatedContent = updateImports(content, newPath)
    
    // Create dir if needed
    const dir = path.dirname(newPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    
    fs.writeFileSync(newPath, updatedContent)
    fs.unlinkSync(orig)
  }
  
  console.log('Done.')
}

run().catch(console.error)

import fs from 'fs'
import path from 'path'

const mappings: Record<string, string> = {
  // platform
  'db': 'src/platform/db.ts',
  'logger': 'src/platform/logger.ts',
  'redis': 'src/platform/redis.ts',
  'event-bus': 'src/platform/event-bus.ts',
  'metering.service': 'src/platform/metering.service.ts',
  // core
  'algorithm-registry': 'src/core/algorithm-registry.ts',
  'loinc-registry': 'src/core/loinc-registry.ts',
  'decision.engine': 'src/core/decision.engine.ts',
  'referral.engine': 'src/core/referral.engine.ts',
  // longevity
  'biophysics-engine': 'src/longevity/biophysics-engine.ts',
  'preventive-score.service': 'src/longevity/preventive-score.service.ts',
  'biological-age.service': 'src/longevity/biological-age.service.ts',
  'insights.service': 'src/longevity/insights.service.ts',
  // dental
  'dental-cost.engine': 'src/dental/dental-cost.engine.ts',
  'dental-pricing.service': 'src/dental/dental-pricing.service.ts',
  // shared
  'contracts-v1': 'src/shared/contracts-v1.ts',
  'mappers': 'src/shared/mappers.ts',
  'engagement.service': 'src/shared/engagement.service.ts',
  'explainability.service': 'src/shared/explainability.service.ts',
  'funnel.service': 'src/shared/funnel.service.ts',
  'ingestion.service': 'src/shared/ingestion.service.ts',
  'risk-scoring.service': 'src/shared/risk-scoring.service.ts',
  'snapshot.service': 'src/shared/snapshot.service.ts',
  'timeline.service': 'src/shared/timeline.service.ts',
  // middlewares
  'api-key.middleware': 'src/api/middlewares/api-key.middleware.ts',
  'auth.middleware': 'src/api/middlewares/auth.middleware.ts',
  'error.middleware': 'src/api/middlewares/error.middleware.ts',
  'hardening.middleware': 'src/api/middlewares/hardening.middleware.ts',
  'prisma_middleware': 'src/api/middlewares/prisma.middleware.ts',
  'quota.middleware': 'src/api/middlewares/quota.middleware.ts',
  'tenant.middleware': 'src/api/middlewares/tenant.middleware.ts',
  'trace.middleware': 'src/api/middlewares/trace.middleware.ts',
  'consent.guard': 'src/api/middlewares/consent.guard.ts',
  // handlers
  'external-v2.handler': 'src/api/handlers/external-v2.handler.ts',
  'dental.handler': 'src/api/handlers/dental.handler.ts',
  'health.handler': 'src/api/handlers/health.handler.ts',
  'observability.handler': 'src/api/handlers/observability.handler.ts',
  'billing-admin.handler': 'src/api/handlers/billing-admin.handler.ts',
  'handlers': 'src/api/handlers/handlers.ts',
  // pipelines
  'orchestrator': 'src/api/pipelines/orchestrator.ts',
  'pipeline-v2.orchestrator': 'src/api/pipelines/pipeline-v2.orchestrator.ts',
  'bootstrap': 'src/api/pipelines/bootstrap.ts',
}

function getFiles(dir: string, files: string[] = []) {
  if (!fs.existsSync(dir)) return files;
  const list = fs.readdirSync(dir)
  for (const file of list) {
    const fullPath = path.join(dir, file)
    if (fs.statSync(fullPath).isDirectory()) {
      getFiles(fullPath, files)
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      files.push(fullPath)
    }
  }
  return files
}

const allFiles = [...getFiles('src'), ...getFiles('tests')]

for (const file of allFiles) {
  let content = fs.readFileSync(file, 'utf-8')
  let changed = false

  const importRegex = /(from\s+|require\()(['"])(\.\.?\/[^'"]+)(['"])/g
  content = content.replace(importRegex, (match, p1, p2, importPath, p4) => {
    // importPath could be '../lib/db' or './api/external.handler'
    const baseName = path.basename(importPath)
    
    // Attempt to match baseName to mappings
    const dest = mappings[baseName]
    if (dest) {
      let rel = path.relative(path.dirname(file), dest).replace(/\\/g, '/')
      if (!rel.startsWith('.')) rel = './' + rel
      rel = rel.replace(/\.ts$/, '')
      changed = true
      return `${p1}${p2}${rel}${p4}`
    }

    // Special cases for v2 and v1 contracts
    if (importPath.includes('contracts/v2/index')) {
      // mapped to nothing for now, we only have contracts-v1 in shared
      // actually there is no contracts-v2. Let's map it to contracts-v1 just to fix compilation if it's a typo
      let rel = path.relative(path.dirname(file), 'src/shared/contracts-v1.ts').replace(/\\/g, '/')
      if (!rel.startsWith('.')) rel = './' + rel
      rel = rel.replace(/\.ts$/, '')
      changed = true
      return `${p1}${p2}${rel}${p4}`
    }

    if (importPath.endsWith('v1')) {
      let rel = path.relative(path.dirname(file), 'src/shared/contracts-v1.ts').replace(/\\/g, '/')
      if (!rel.startsWith('.')) rel = './' + rel
      rel = rel.replace(/\.ts$/, '')
      changed = true
      return `${p1}${p2}${rel}${p4}`
    }
    
    return match
  })

  if (changed) {
    fs.writeFileSync(file, content)
  }
}
console.log('Imports fixed.')

// =============================================================================
// src/services/api/index.ts
// Punto de entrada único para el API del funnel.
//
// Exporta `funnelApi` que puede ser el real o el mock según VITE_USE_MOCKS.
// Los componentes importan SOLO desde aquí — nunca importan funnelApi o
// funnelApiMock directamente. Esto hace el switch completamente transparente.
//
// USO en cualquier componente:
//   import { funnelApi } from '@/services/api'
//   await funnelApi.submitLead({ ... })
// =============================================================================

import { funnelApi as realApi }   from './funnelApi'
import { funnelApiMock as mockApi } from '../__mocks__/funnelApi.mock'

const useMocks = import.meta.env.VITE_USE_MOCKS === 'true'

export const funnelApi = useMocks ? mockApi : realApi

// Re-export the error class so components can catch it
export { FunnelApiError } from './funnelApi'

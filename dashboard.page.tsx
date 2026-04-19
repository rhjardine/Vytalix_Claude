// app/dashboard/page.tsx — Physician Dashboard (Server Component)
// Fetches patients server-side, renders with real risk data, no mock data.

import { Suspense } from 'react'
import { cookies, headers } from 'next/headers'
import { PatientListTable } from '@/components/dashboard/PatientListTable'
import { DashboardStats } from '@/components/dashboard/DashboardStats'

async function getPatients(tenantId: string, token: string) {
  const url = new URL('/v1/patients', process.env.NEXT_PUBLIC_API_URL)
  url.searchParams.set('pageSize', '25')
  url.searchParams.set('hasPendingDecisions', 'true')

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': tenantId,
      'X-Correlation-ID': crypto.randomUUID(),
    },
    next: { revalidate: 60 },  // ISR: revalidate every 60s
  })

  if (!res.ok) throw new Error('Failed to fetch patients')
  return res.json()
}

export default async function DashboardPage() {
  const cookieStore = cookies()
  const token = cookieStore.get('auth_token')?.value ?? ''
  const tenantId = cookieStore.get('tenant_id')?.value ?? ''

  const { data: patients, meta } = await getPatients(tenantId, token)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Clinical Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">Vytalix Clinical Intelligence Engine</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{meta?.total ?? 0} patients</span>
            <div className="w-2 h-2 rounded-full bg-green-400" title="System operational" />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <Suspense fallback={<StatsLoader />}>
          <DashboardStats patients={patients} />
        </Suspense>

        <div className="mt-6 bg-white rounded-lg border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Patients requiring attention</h2>
            <span className="text-xs text-gray-400">Sorted by urgency</span>
          </div>
          <Suspense fallback={<TableLoader />}>
            <PatientListTable patients={patients} />
          </Suspense>
        </div>
      </main>
    </div>
  )
}

function StatsLoader() {
  return (
    <div className="grid grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
      ))}
    </div>
  )
}

function TableLoader() {
  return (
    <div className="p-6 space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-12 bg-gray-50 rounded animate-pulse" />
      ))}
    </div>
  )
}

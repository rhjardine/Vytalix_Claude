import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { TenantProvider } from '@/providers/tenant-provider';
import { Sidebar } from '@/components/layout/Sidebar';

// ── Fonts ─────────────────────────────────────────────────────────────────────

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500'],
});

// ── Metadata ──────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: {
    default: 'CFE Dental — Vytalix',
    template: '%s | CFE Dental',
  },
  description:
    'Panel de administración para la vertical de Odontología Financiera de Vytalix. ' +
    'Cotización, inventario, planes de tratamiento y auditoría clínica.',
  robots: { index: false, follow: false }, // Internal tool — no indexing
};

// ── Layout ────────────────────────────────────────────────────────────────────

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-surface text-ink antialiased">
        {/*
          TenantProvider marked 'use client' — safe to nest inside a Server Component layout.
          It rehydrates the session from sessionStorage on mount (client-side only).
        */}
        <TenantProvider>
          <div className="flex h-screen overflow-hidden">
            {/* Fixed navigation sidebar */}
            <Sidebar />

            {/* Scrollable main content area */}
            <main className="flex-1 overflow-y-auto focus:outline-none">
              <div className="max-w-7xl mx-auto px-6 py-8">
                {children}
              </div>
            </main>
          </div>
        </TenantProvider>
      </body>
    </html>
  );
}

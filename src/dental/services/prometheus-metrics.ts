/**
 * PrometheusMetrics.ts — Vytalix CFE Dental: Prometheus Metrics
 *
 * Exposes dental metrics in Prometheus text format via GET /metrics.
 * Uses a lightweight in-process registry — no external Prometheus client
 * dependency needed (avoids adding prom-client to the production bundle).
 *
 * Metrics exposed:
 *   dental_quotes_created_total{tenant_id, currency}   counter
 *   dental_plans_created_total{tenant_id}               counter
 *   dental_inventory_movements_total{tenant_id, type}   counter
 *   dental_revenue_estimated_total{tenant_id, currency} counter (minor units)
 *   dental_vouchers_issued_total{tenant_id}             counter
 *   dental_vouchers_redeemed_total{tenant_id, result}   counter
 *   dental_active_plans_gauge{tenant_id}                gauge (set on query)
 *
 * Format: Prometheus text format 0.0.4
 * https://prometheus.io/docs/instrumenting/exposition_formats/
 */

// ─── Registry ─────────────────────────────────────────────────────────────────

interface MetricFamily {
  help: string;
  type: 'counter' | 'gauge';
  samples: Map<string, number>;  // key = serialised labels → value
}

const registry = new Map<string, MetricFamily>();

function getOrCreate(name: string, help: string, type: 'counter' | 'gauge'): MetricFamily {
  if (!registry.has(name)) {
    registry.set(name, { help, type, samples: new Map() });
  }
  return registry.get(name)!;
}

function labelKey(labels: Record<string, string>): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)
    .join(',');
}

// ─── Public increment / set API ───────────────────────────────────────────────

export function incCounter(
  name: string,
  help: string,
  labels: Record<string, string> = {},
  value = 1
): void {
  const family = getOrCreate(name, help, 'counter');
  const key = labelKey(labels);
  family.samples.set(key, (family.samples.get(key) ?? 0) + value);
}

export function setGauge(
  name: string,
  help: string,
  labels: Record<string, string> = {},
  value: number
): void {
  const family = getOrCreate(name, help, 'gauge');
  const key = labelKey(labels);
  family.samples.set(key, value);
}

// ─── Dental metric helpers ────────────────────────────────────────────────────

export const dentalMetrics = {
  quoteCreated(tenantId: string, currency: string): void {
    incCounter(
      'dental_quotes_created_total',
      'Total dental quotes generated',
      { tenant_id: tenantId, currency }
    );
  },

  planCreated(tenantId: string): void {
    incCounter(
      'dental_plans_created_total',
      'Total dental treatment plans created',
      { tenant_id: tenantId }
    );
  },

  inventoryMovement(tenantId: string, type: string): void {
    incCounter(
      'dental_inventory_movements_total',
      'Total dental inventory movements recorded',
      { tenant_id: tenantId, type }
    );
  },

  revenueEstimated(tenantId: string, currency: string, amountMinorUnits: number): void {
    incCounter(
      'dental_revenue_estimated_total',
      'Total estimated dental revenue in minor currency units',
      { tenant_id: tenantId, currency },
      amountMinorUnits
    );
  },

  voucherIssued(tenantId: string): void {
    incCounter(
      'dental_vouchers_issued_total',
      'Total dental vouchers issued',
      { tenant_id: tenantId }
    );
  },

  voucherRedeemed(tenantId: string, result: 'SUCCESS' | 'FAILED'): void {
    incCounter(
      'dental_vouchers_redeemed_total',
      'Total dental voucher redemption attempts',
      { tenant_id: tenantId, result }
    );
  },

  setActivePlans(tenantId: string, count: number): void {
    setGauge(
      'dental_active_plans_gauge',
      'Current number of active dental treatment plans',
      { tenant_id: tenantId },
      count
    );
  },
};

// ─── Prometheus text format renderer ─────────────────────────────────────────

export function renderPrometheusText(): string {
  const lines: string[] = [];

  for (const [name, family] of registry) {
    lines.push(`# HELP ${name} ${family.help}`);
    lines.push(`# TYPE ${name} ${family.type}`);

    for (const [labelKey, value] of family.samples) {
      const labelStr = labelKey ? `{${labelKey}}` : '';
      lines.push(`${name}${labelStr} ${value}`);
    }
  }

  return lines.join('\n') + '\n';
}

/** Reset all metrics — for test isolation only */
export function resetAllMetrics(): void {
  registry.clear();
}

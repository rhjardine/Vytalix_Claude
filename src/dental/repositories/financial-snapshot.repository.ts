import { PoolClient } from 'pg';
import type { ApiResponse } from '../../shared/types/domain';

export interface FinancialSnapshotRow {
  id: string;
  tenantId: string;
  snapshotType: string;
  grossMarginBps: number;
  netMarginBps: number;
  netRevenue: number;
  currency: string;
  createdAt: Date;
}

export interface FinancialAggregate {
  avgGrossMarginBps: number;
  avgNetMarginBps: number;
  totalNetRevenue: number;
  currency: string;
  snapshotCount: number;
}

export class FinancialSnapshotRepository {
  async aggregateByPeriod(
    client: PoolClient,
    period: string
  ): Promise<ApiResponse<FinancialAggregate>> {
    const result = await client.query(
      `SELECT
         COALESCE(AVG(gross_margin_bps), 0)::int AS avg_gross_margin_bps,
         COALESCE(AVG(net_margin_bps), 0)::int AS avg_net_margin_bps,
         COALESCE(SUM(net_revenue), 0)::int AS total_net_revenue,
         COALESCE(MIN(currency), 'MXN') AS currency,
         COUNT(*)::int AS snapshot_count
       FROM dental_financial_snapshots
       WHERE TO_CHAR(created_at, 'YYYY-MM') = $1`,
      [period]
    );

    const r = result.rows[0];
    return {
      success: true,
      data: {
        avgGrossMarginBps: r.avg_gross_margin_bps,
        avgNetMarginBps: r.avg_net_margin_bps,
        totalNetRevenue: r.total_net_revenue,
        currency: r.currency,
        snapshotCount: r.snapshot_count,
      },
    };
  }

  async query(
    client: PoolClient,
    options: { period: string; snapshotType?: string; page?: number; pageSize?: number }
  ): Promise<ApiResponse<FinancialSnapshotRow[]> & { pagination: { total: number; page: number; pageSize: number; totalPages: number } }> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 50;
    const offset = (page - 1) * pageSize;

    const countResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM dental_financial_snapshots
       WHERE TO_CHAR(created_at, 'YYYY-MM') = $1
         AND ($2::varchar IS NULL OR snapshot_type = $2)`,
      [options.period, options.snapshotType ?? null]
    );
    const total = countResult.rows[0]?.count ?? 0;

    const listResult = await client.query(
      `SELECT * FROM dental_financial_snapshots
       WHERE TO_CHAR(created_at, 'YYYY-MM') = $1
         AND ($2::varchar IS NULL OR snapshot_type = $2)
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [options.period, options.snapshotType ?? null, pageSize, offset]
    );

    return {
      success: true,
      data: listResult.rows.map(r => ({
        id: r.id,
        tenantId: r.tenant_id,
        snapshotType: r.snapshot_type,
        grossMarginBps: r.gross_margin_bps,
        netMarginBps: r.net_margin_bps,
        netRevenue: r.net_revenue,
        currency: r.currency,
        createdAt: r.created_at,
      })),
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }
}

export const financialSnapshotRepository = new FinancialSnapshotRepository();

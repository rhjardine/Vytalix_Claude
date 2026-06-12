import { PoolClient } from 'pg';
import type { TenantId, ApiResponse } from '../../shared/types/domain';
import type { CreateCatalogItemInput, CreatePricingRuleInput, CreateExchangeRateInput, UpsertTenantSettingsInput } from '../schemas/dental-schemas';

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface DentalCatalogItem {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description?: string;
  category: string;
  baseCost: number;
  suggestedPrice: number;
  currency: string;
  durationMinutes?: number;
  isActive: boolean;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PricingRule {
  id: string;
  tenantId: string;
  catalogItemCode?: string;
  category?: string;
  marginPercent?: number;
  discountPercent?: number;
  fixedPrice?: number;
  currency?: string;
  validFrom: Date;
  validUntil?: Date;
  priority: number;
  isActive: boolean;
  createdAt: Date;
}

export interface ExchangeRateSnapshot {
  id: string;
  tenantId: string;
  baseCurrency: string;
  rates: Record<string, number>;
  source: string;
  effectiveAt: Date;
  createdAt: Date;
}

export interface TenantSettings {
  id: string;
  tenantId: string;
  defaultCurrency: string;
  taxRate: number;
  defaultMarginPercent: number;
  financingEnabled: boolean;
  timezone: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// ─── DentalCatalogRepository ───────────────────────────────────────────────────

export class DentalCatalogRepository {
  async create(
    client: PoolClient,
    tenantId: TenantId,
    input: CreateCatalogItemInput
  ): Promise<ApiResponse<DentalCatalogItem>> {
    const result = await client.query(
      `INSERT INTO dental_catalog_items
         (id, tenant_id, code, name, description, category, base_cost, suggested_price, currency, duration_minutes, is_active, metadata, created_at, updated_at)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
       RETURNING *`,
      [
        tenantId,
        input.code,
        input.name,
        input.description ?? null,
        input.category,
        input.baseCost,
        input.suggestedPrice,
        input.currency,
        input.durationMinutes ?? null,
        input.isActive ?? true,
        JSON.stringify(input.metadata ?? {}),
      ]
    );

    return { success: true, data: this.rowToModel(result.rows[0]) };
  }

  async findByCode(client: PoolClient, code: string): Promise<ApiResponse<DentalCatalogItem>> {
    const result = await client.query(
      `SELECT * FROM dental_catalog_items WHERE code = $1 AND is_active = TRUE`,
      [code]
    );

    if (!result.rows.length) {
      return { success: false, error: { code: 'NOT_FOUND', message: `Catalog item ${code} not found` } };
    }

    return { success: true, data: this.rowToModel(result.rows[0]) };
  }

  async list(
    client: PoolClient,
    options: { category?: string; isActive?: boolean; page?: number; pageSize?: number }
  ): Promise<ApiResponse<DentalCatalogItem[]> & { pagination: { total: number; page: number; pageSize: number; totalPages: number } }> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const whereClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (options.category) {
      whereClauses.push(`category = $${paramIndex++}`);
      params.push(options.category);
    }

    if (options.isActive !== undefined) {
      whereClauses.push(`is_active = $${paramIndex++}`);
      params.push(options.isActive);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM dental_catalog_items ${whereSql}`,
      params
    );
    const totalVal = countResult.rows[0]?.count;
    const total = typeof totalVal === 'string' ? parseInt(totalVal, 10) : (totalVal ?? 0);

    const listParams = [...params, pageSize, offset];
    const listResult = await client.query(
      `SELECT * FROM dental_catalog_items
       ${whereSql}
       ORDER BY code ASC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      listParams
    );

    return {
      success: true,
      data: listResult.rows.map(r => this.rowToModel(r)),
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  private rowToModel(r: any): DentalCatalogItem {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      code: r.code,
      name: r.name,
      description: r.description ?? undefined,
      category: r.category,
      baseCost: r.base_cost,
      suggestedPrice: r.suggested_price,
      currency: r.currency,
      durationMinutes: r.duration_minutes ?? undefined,
      isActive: r.is_active,
      metadata: r.metadata ?? {},
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}

// ─── PricingRuleRepository ────────────────────────────────────────────────────

export class PricingRuleRepository {
  async create(
    client: PoolClient,
    tenantId: TenantId,
    input: CreatePricingRuleInput
  ): Promise<ApiResponse<PricingRule>> {
    const result = await client.query(
      `INSERT INTO dental_pricing_rules
         (id, tenant_id, catalog_item_code, category, margin_percent, discount_percent, fixed_price, currency, valid_from, valid_until, priority, is_active, created_at)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       RETURNING *`,
      [
        tenantId,
        input.catalogItemCode ?? null,
        input.category ?? null,
        input.marginPercent ?? null,
        input.discountPercent ?? null,
        input.fixedPrice ?? null,
        input.currency ?? null,
        input.validFrom ? new Date(input.validFrom) : new Date(),
        input.validUntil ? new Date(input.validUntil) : null,
        input.priority ?? 0,
        input.isActive ?? true,
      ]
    );

    return { success: true, data: this.rowToModel(result.rows[0]) };
  }

  async resolvePrice(
    client: PoolClient,
    code: string,
    category: string,
    baseCost: number,
    suggestedPrice: number,
    currency: string,
    defaultMarginPercent: number
  ): Promise<{ finalPrice: number; marginPercent: number; appliedRuleType: 'ITEM_RULE' | 'CATEGORY_RULE' | 'TENANT_DEFAULT'; appliedRuleId?: string; currency: string }> {
    // Select the highest priority active rule for this item or category
    const result = await client.query(
      `SELECT * FROM dental_pricing_rules
       WHERE is_active = TRUE
         AND (catalog_item_code = $1 OR category = $2)
         AND (valid_from <= NOW() AND (valid_until IS NULL OR valid_until >= NOW()))
       ORDER BY
         CASE WHEN catalog_item_code = $1 THEN 2 ELSE 1 END DESC,
         priority DESC,
         created_at DESC
       LIMIT 1`,
      [code, category]
    );

    if (result.rows.length > 0) {
      const rule = result.rows[0];
      let finalPrice = suggestedPrice;
      let appliedMargin = defaultMarginPercent;

      if (rule.fixed_price !== null && rule.fixed_price !== undefined) {
        finalPrice = rule.fixed_price;
      } else if (rule.margin_percent !== null && rule.margin_percent !== undefined) {
        appliedMargin = parseFloat(rule.margin_percent);
        finalPrice = baseCost * (1 + appliedMargin / 100);
      } else if (rule.discount_percent !== null && rule.discount_percent !== undefined) {
        const discount = parseFloat(rule.discount_percent);
        finalPrice = suggestedPrice * (1 - discount / 100);
      }

      return {
        finalPrice: Math.round(finalPrice),
        marginPercent: appliedMargin,
        appliedRuleType: rule.catalog_item_code ? 'ITEM_RULE' : 'CATEGORY_RULE',
        appliedRuleId: rule.id,
        currency: rule.currency ?? currency,
      };
    }

    // Fallback to Tenant Default Margin
    const finalPrice = baseCost * (1 + defaultMarginPercent / 100);
    return {
      finalPrice: Math.round(finalPrice),
      marginPercent: defaultMarginPercent,
      appliedRuleType: 'TENANT_DEFAULT',
      currency,
    };
  }

  private rowToModel(r: any): PricingRule {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      catalogItemCode: r.catalog_item_code ?? undefined,
      category: r.category ?? undefined,
      marginPercent: r.margin_percent ? parseFloat(r.margin_percent) : undefined,
      discountPercent: r.discount_percent ? parseFloat(r.discount_percent) : undefined,
      fixedPrice: r.fixed_price ?? undefined,
      currency: r.currency ?? undefined,
      validFrom: r.valid_from,
      validUntil: r.valid_until ?? undefined,
      priority: r.priority,
      isActive: r.is_active,
      createdAt: r.created_at,
    };
  }
}

// ─── ExchangeRateRepository ───────────────────────────────────────────────────

export class ExchangeRateRepository {
  async save(
    client: PoolClient,
    tenantId: TenantId,
    input: CreateExchangeRateInput
  ): Promise<ApiResponse<ExchangeRateSnapshot>> {
    const result = await client.query(
      `INSERT INTO dental_exchange_rate_snapshots
         (id, tenant_id, base_currency, rates, source, effective_at, created_at)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [
        tenantId,
        input.baseCurrency,
        JSON.stringify(input.rates),
        input.source ?? 'manual',
        input.effectiveAt ? new Date(input.effectiveAt) : new Date(),
      ]
    );

    return { success: true, data: this.rowToModel(result.rows[0]) };
  }

  async getLatest(client: PoolClient, baseCurrency: string): Promise<ExchangeRateSnapshot | null> {
    const result = await client.query(
      `SELECT * FROM dental_exchange_rate_snapshots
       WHERE base_currency = $1
       ORDER BY effective_at DESC
       LIMIT 1`,
      [baseCurrency]
    );

    if (!result.rows.length) return null;
    return this.rowToModel(result.rows[0]);
  }

  private rowToModel(r: any): ExchangeRateSnapshot {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      baseCurrency: r.base_currency,
      rates: typeof r.rates === 'string' ? JSON.parse(r.rates) : r.rates,
      source: r.source,
      effectiveAt: r.effective_at,
      createdAt: r.created_at,
    };
  }
}

// ─── TenantSettingsService ────────────────────────────────────────────────────

export class TenantSettingsService {
  async upsert(
    client: PoolClient,
    tenantId: TenantId,
    input: UpsertTenantSettingsInput
  ): Promise<ApiResponse<TenantSettings>> {
    const result = await client.query(
      `INSERT INTO dental_tenant_settings
         (id, tenant_id, default_currency, tax_rate, default_margin_percent, financing_enabled, timezone, metadata, created_at, updated_at)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         default_currency = EXCLUDED.default_currency,
         tax_rate = EXCLUDED.tax_rate,
         default_margin_percent = EXCLUDED.default_margin_percent,
         financing_enabled = EXCLUDED.financing_enabled,
         timezone = EXCLUDED.timezone,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()
       RETURNING *`,
      [
        tenantId,
        input.defaultCurrency,
        input.taxRate,
        input.defaultMarginPercent,
        input.financingEnabled ?? false,
        input.timezone ?? 'America/Mexico_City',
        JSON.stringify(input.metadata ?? {}),
      ]
    );

    return { success: true, data: this.rowToModel(result.rows[0]) };
  }

  async getOrDefault(client: PoolClient): Promise<TenantSettings> {
    const result = await client.query(
      `SELECT * FROM dental_tenant_settings LIMIT 1`
    );

    if (result.rows.length > 0) {
      return this.rowToModel(result.rows[0]);
    }

    // Safe Defaults
    return {
      id: 'default',
      tenantId: '00000000-0000-0000-0000-000000000000',
      defaultCurrency: 'MXN',
      taxRate: 16.0,
      defaultMarginPercent: 35.0,
      financingEnabled: false,
      timezone: 'America/Mexico_City',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private rowToModel(r: any): TenantSettings {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      defaultCurrency: r.default_currency,
      taxRate: parseFloat(r.tax_rate),
      defaultMarginPercent: parseFloat(r.default_margin_percent),
      financingEnabled: r.financing_enabled,
      timezone: r.timezone,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}

// ─── Export Singletons ─────────────────────────────────────────────────────────

export const dentalCatalogRepository = new DentalCatalogRepository();
export const pricingRuleRepository = new PricingRuleRepository();
export const exchangeRateRepository = new ExchangeRateRepository();
export const tenantSettingsService = new TenantSettingsService();

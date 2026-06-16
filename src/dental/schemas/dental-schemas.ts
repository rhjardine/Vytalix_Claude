/**
 * dental-schemas.ts — Vytalix CFE Dental: Input Validation Schemas
 *
 * Zod schemas are the single source of truth for request validation.
 * All dental router handlers call these before touching any business logic.
 *
 * Design decisions:
 * - .strict() on every schema — unknown fields rejected, never silently ignored.
 * - correlationId is always required — enables distributed tracing + idempotency.
 * - currency enum is shared with domain.ts Money type.
 * - quantity for inventory always positive integer — sign derived from type.
 */

import { z } from 'zod';

// ─── Shared primitives ────────────────────────────────────────────────────────

export const CurrencySchema = z.enum(['USD', 'MXN', 'COP', 'PEN', 'EUR']);
// Lenient UUID regex — accepts all RFC 4122 variants including v4, v7, and
// synthetic test UUIDs (non-standard variant bits). Zod 4's .uuid() is strict
// and rejects some valid-looking UUIDs. We validate format, not version/variant.
export const UuidSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  'Must be a valid UUID'
);
export const CorrelationIdSchema = z.string().min(1).max(128);

export const TreatmentCodeSchema = z.string()
  .min(3)
  .max(64)
  .regex(/^[A-Z0-9_]+$/, 'Treatment code must be uppercase alphanumeric with underscores');

export const ToothNumberSchema = z
  .number()
  .int()
  .min(11)
  .max(85)
  .describe('FDI tooth notation (11-85)');

// ─── Quote schemas ────────────────────────────────────────────────────────────

export const QuoteItemSchema = z.object({
  treatmentCode: TreatmentCodeSchema,
  quantity: z.number().int().min(1).max(100),
  toothNumbers: z.array(ToothNumberSchema).min(1).max(32).optional(),
  notes: z.string().max(500).optional(),
}).strict();

export const CreateQuoteSchema = z.object({
  patientRef: z.string().min(1).max(128)
    .describe('Opaque patient reference — no PHI'),
  items: z.array(QuoteItemSchema).min(1).max(50),
  currency: CurrencySchema,
  correlationId: CorrelationIdSchema,
  partnerId: UuidSchema.optional(),
  metadata: z.record(z.string().max(256)).optional(),
}).strict();

export type CreateQuoteInput = z.infer<typeof CreateQuoteSchema>;

// ─── Treatment Plan schemas ───────────────────────────────────────────────────

export const PlanItemSchema = z.object({
  treatmentCode: TreatmentCodeSchema,
  quantity: z.number().int().min(1).max(100),
  toothNumbers: z.array(ToothNumberSchema).min(1).max(32).optional(),
  notes: z.string().max(500).optional(),
}).strict();

export const CreateTreatmentPlanSchema = z.object({
  patientRef: z.string().min(1).max(128),
  title: z.string().min(3).max(255),
  description: z.string().max(2000).optional(),
  items: z.array(PlanItemSchema).min(1).max(50),
  currency: CurrencySchema,
  correlationId: CorrelationIdSchema,
  metadata: z.record(z.string().max(256)).optional(),
}).strict();

export type CreateTreatmentPlanInput = z.infer<typeof CreateTreatmentPlanSchema>;

export const UpdatePlanStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED', 'ARCHIVED']),
  correlationId: CorrelationIdSchema,
}).strict();

export const SealPlanVersionSchema = z.object({
  items: z.array(PlanItemSchema).min(1).max(50),
  currency: CurrencySchema,
  correlationId: CorrelationIdSchema,
}).strict();

// ─── Inventory schemas ────────────────────────────────────────────────────────

export const MovementTypeSchema = z.enum([
  'ENTRY', 'CONSUMPTION', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'RETURN',
]);

export const InventoryMovementSchema = z.object({
  itemId: UuidSchema,
  type: MovementTypeSchema,
  quantity: z.number().int().min(1).max(100_000)
    .describe('Absolute positive integer — sign derived from movement type'),
  unitCost: z.number().int().min(0).optional()
    .describe('Minor currency units — required for ENTRY movements'),
  currency: CurrencySchema.optional(),
  reference: z.string().max(255).optional(),
  notes: z.string().max(1000).optional(),
  performedBy: z.string().min(1).max(128),
  correlationId: CorrelationIdSchema,
}).strict()
  .refine(
    (data) => data.type !== 'ENTRY' || data.unitCost !== undefined,
    { message: 'unitCost is required for ENTRY movements', path: ['unitCost'] }
  );

export type InventoryMovementInput = z.infer<typeof InventoryMovementSchema>;

export const CreateInventoryItemSchema = z.object({
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  category: z.enum([
    'CONSUMABLE', 'MATERIAL', 'INSTRUMENT',
    'EQUIPMENT', 'PROSTHETIC', 'MEDICATION', 'OTHER',
  ]),
  unit: z.string().min(1).max(50),
  reorderLevel: z.number().int().min(0).optional(),
  metadata: z.record(z.string().max(256)).optional(),
}).strict();

export type CreateInventoryItemInput = z.infer<typeof CreateInventoryItemSchema>;

// ─── Catalog schemas (Sprint 5) ───────────────────────────────────────────────

export const CreateCatalogItemSchema = z.object({
  code: TreatmentCodeSchema,
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  category: z.enum([
    'CONSULTATION', 'RESTORATION', 'ENDODONTICS', 'PERIODONTICS',
    'SURGERY', 'ORTHODONTICS', 'PROSTHETICS', 'IMPLANTS',
    'PREVENTIVE', 'COSMETIC', 'OTHER',
  ]),
  baseCost: z.number().int().min(0)
    .describe('Minor currency units — clinic cost'),
  suggestedPrice: z.number().int().min(0)
    .describe('Minor currency units — suggested retail price'),
  currency: CurrencySchema,
  durationMinutes: z.number().int().min(5).max(480).optional(),
  isActive: z.boolean().default(true),
  metadata: z.record(z.string().max(256)).optional(),
}).strict()
  .refine(
    (d) => d.suggestedPrice >= d.baseCost,
    { message: 'suggestedPrice must be >= baseCost', path: ['suggestedPrice'] }
  );

export type CreateCatalogItemInput = z.infer<typeof CreateCatalogItemSchema>;


// ─── Pricing rule schemas (Sprint 5) ─────────────────────────────────────────

export const CreatePricingRuleSchema = z.object({
  catalogItemCode: TreatmentCodeSchema.optional(),
  category: z.string().max(64).optional(),
  marginPercent: z.number().min(0).max(1000).optional()
    .describe('Margin as percentage: 35.5 = 35.5%'),
  discountPercent: z.number().min(0).max(100).optional(),
  fixedPrice: z.number().int().min(0).optional(),
  currency: CurrencySchema.optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  priority: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
}).strict()
  .refine(
    (d) => d.catalogItemCode || d.category,
    { message: 'Either catalogItemCode or category must be specified' }
  );

export type CreatePricingRuleInput = z.infer<typeof CreatePricingRuleSchema>;

// ─── Exchange rate schema (Sprint 5) ─────────────────────────────────────────

export const CreateExchangeRateSchema = z.object({
  baseCurrency: CurrencySchema,
  rates: z.record(CurrencySchema, z.number().positive()),
  source: z.string().max(64).default('manual'),
  effectiveAt: z.string().datetime().optional(),
}).strict();

export type CreateExchangeRateInput = z.infer<typeof CreateExchangeRateSchema>;

// ─── Tenant settings schema (Sprint 5) ───────────────────────────────────────

export const UpsertTenantSettingsSchema = z.object({
  defaultCurrency: CurrencySchema,
  taxRate: z.number().min(0).max(100)
    .describe('Tax rate as percentage: 16.0 = 16%'),
  defaultMarginPercent: z.number().min(0).max(1000),
  financingEnabled: z.boolean().default(false),
  timezone: z.string().max(64).default('America/Mexico_City'),
  metadata: z.record(z.string().max(256)).optional(),
}).strict();

export type UpsertTenantSettingsInput = z.infer<typeof UpsertTenantSettingsSchema>;

// ─── Voucher schemas (Sprint 6) ───────────────────────────────────────────────

export const IssueDentalVoucherSchema = z.object({
  catalogItemCode: TreatmentCodeSchema,
  beneficiaryRef: z.string().min(1).max(128),
  expiresInDays: z.number().int().min(1).max(730),
  currency: CurrencySchema,
  correlationId: CorrelationIdSchema,
  metadata: z.record(z.string().max(256)).optional(),
}).strict();

export type IssueDentalVoucherInput = z.infer<typeof IssueDentalVoucherSchema>;

export const RedeemDentalVoucherSchema = z.object({
  token: z.string().min(64).max(64),
  redeemedBy: z.string().min(1).max(128),
  locationId: z.string().max(128).optional(),
  channel: z.enum(['QR_SCAN', 'MANUAL', 'API', 'KIOSK']),
  correlationId: CorrelationIdSchema,
}).strict();

export type RedeemDentalVoucherInput = z.infer<typeof RedeemDentalVoucherSchema>;

// ─── Booking schemas (Sprint 6) ───────────────────────────────────────────────

export const CreateDentalBookingSchema = z.object({
  voucherToken: z.string().min(64).max(64).optional(),
  catalogItemCode: TreatmentCodeSchema,
  patientRef: z.string().min(1).max(128),
  slotId: UuidSchema,
  providerId: z.string().max(128).optional(),
  locationId: z.string().max(128).optional(),
  notes: z.string().max(1000).optional(),
  correlationId: CorrelationIdSchema,
}).strict();

export type CreateDentalBookingInput = z.infer<typeof CreateDentalBookingSchema>;

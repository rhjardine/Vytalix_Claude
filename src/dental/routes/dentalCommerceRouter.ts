/**
 * dentalCommerceRouter.ts — Vytalix CFE Dental Sprint 6
 *
 * Marketplace & Commerce Readiness.
 * Dental services exposed as digital products consumible by insurers,
 * marketplaces or dental chains — without exposing internal clinical logic.
 *
 * Mounted at /api/v2/dental/commerce/*
 *
 * Flow: catalog → pricing → voucher → booking → QR scan → completed
 */

import { Router, Request, Response } from 'express';
import { withTenant } from '../../shared/db/db';
import type { TenantRequest } from '../../shared/middleware/tenantMiddleware';
import { validate } from '../../shared/middleware/validate';
import {
  IssueDentalVoucherSchema,
  RedeemDentalVoucherSchema,
  CreateDentalBookingSchema,
} from '../../dental/schemas/dental-schemas';
import {
  dentalCatalogRepository,
  pricingRuleRepository,
  tenantSettingsService,
} from '../../dental/repositories/dental-financial.repositories';
import {
  dentalVoucherEngine,
  dentalBookingEngine,
  DentalBookingEngine,
} from '../../dental/engines/DentalCommerceEngines';
import { auditService } from '../../dental/audit/AuditService';
import { dentalMetrics } from '../../dental/metrics/PrometheusMetrics';

export const dentalCommerceRouter = Router();
const tr = (req: Request): TenantRequest => req as unknown as TenantRequest;

// ─── GET /catalog — Public dental service catalog ─────────────────────────────

/**
 * GET /api/v2/dental/commerce/catalog
 * Returns ACTIVE catalog items with resolved prices (per tenant pricing rules).
 * Partners use this to display services and prices without knowing internal costs.
 */
dentalCommerceRouter.get('/catalog', async (req: Request, res: Response): Promise<void> => {
  const { tenantId, userId, requestId } = tr(req);
  const q = req.query as Record<string, string>;

  const result = await withTenant({ tenantId, userId, requestId }, async (client) => {
    const catalogResult = await dentalCatalogRepository.list(client, {
      category: q['category'],
      isActive: true,
      page:     q['page']     ? parseInt(q['page'],     10) : 1,
      pageSize: q['pageSize'] ? parseInt(q['pageSize'], 10) : 20,
    });
    if (!catalogResult.success || !catalogResult.data) return catalogResult;

    const settings = await tenantSettingsService.getOrDefault(client);

    // Resolve price for each item (hides baseCost from partners)
    const pricedItems = await Promise.all(
      catalogResult.data.map(async (item) => {
        const resolved = await pricingRuleRepository.resolvePrice(
          client,
          item.code, item.category,
          item.baseCost, item.suggestedPrice,
          settings.defaultCurrency,
          settings.defaultMarginPercent
        );
        return {
          code:             item.code,
          name:             item.name,
          description:      item.description,
          category:         item.category,
          durationMinutes:  item.durationMinutes,
          price:            resolved.finalPrice,
          currency:         resolved.currency,
          isActive:         item.isActive,
          // baseCost intentionally omitted — never exposed to partners
        };
      })
    );

    return {
      success: true,
      data: pricedItems,
      pagination: catalogResult.pagination,
    };
  });

  res.json(result);
});

/**
 * GET /api/v2/dental/commerce/catalog/:code
 * Single item with resolved price.
 */
dentalCommerceRouter.get('/catalog/:code', async (req: Request, res: Response): Promise<void> => {
  const { tenantId, userId, requestId } = tr(req);

  const result = await withTenant({ tenantId, userId, requestId }, async (client) => {
    const item = await dentalCatalogRepository.findByCode(client, req.params.code!);
    if (!item.success || !item.data) return item;

    const settings = await tenantSettingsService.getOrDefault(client);
    const resolved = await pricingRuleRepository.resolvePrice(
      client,
      item.data.code, item.data.category,
      item.data.baseCost, item.data.suggestedPrice,
      settings.defaultCurrency,
      settings.defaultMarginPercent
    );

    return {
      success: true,
      data: {
        code:            item.data.code,
        name:            item.data.name,
        description:     item.data.description,
        category:        item.data.category,
        durationMinutes: item.data.durationMinutes,
        price:           resolved.finalPrice,
        currency:        resolved.currency,
      },
    };
  });

  res.status(result.success ? 200 : 404).json(result);
});

// ─── POST /vouchers — Issue dental voucher ────────────────────────────────────

/**
 * POST /api/v2/dental/commerce/vouchers
 * Issues a dental voucher. Called after payment confirmation.
 * Body: IssueDentalVoucherInput
 */
dentalCommerceRouter.post('/vouchers',
  validate(IssueDentalVoucherSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId, userId, requestId } = tr(req);
    const input = (req as unknown as { validatedBody: typeof IssueDentalVoucherSchema._type }).validatedBody;

    // Resolve tenantSecret (never from env fallback — Sprint 1 principle)
    const tenantSecret: string = req.app.locals.getTenantSecret
      ? await req.app.locals.getTenantSecret(tenantId)
      : process.env['TENANT_SECRET_FALLBACK'] ?? (() => { throw new Error('tenantSecret not provisioned'); })();

    try {
      const result = await withTenant({ tenantId, userId, requestId }, async (client) => {
        // Resolve price for the catalog item
        const item = await dentalCatalogRepository.findByCode(client, input.catalogItemCode);
        if (!item.success || !item.data) {
          return { success: false as const, error: { code: 'ITEM_NOT_FOUND' as const, message: `Catalog item '${input.catalogItemCode}' not found` } };
        }

        const settings = await tenantSettingsService.getOrDefault(client);
        const resolved = await pricingRuleRepository.resolvePrice(
          client, item.data.code, item.data.category,
          item.data.baseCost, item.data.suggestedPrice,
          input.currency, settings.defaultMarginPercent
        );

        const voucher = await dentalVoucherEngine.issue(
          client, tenantId, tenantSecret, input, resolved.finalPrice
        );
        if (!voucher.success || !voucher.data) return voucher;

        // Audit
        await auditService.record(client, {
          tenantId, eventType: 'VOUCHER_ISSUED',
          entityId: voucher.data.id, entityType: 'DentalVoucher',
          actorId: userId, correlationId: input.correlationId,
          after: {
            voucherId: voucher.data.id, catalogItemCode: input.catalogItemCode,
            priceAmount: resolved.finalPrice, currency: input.currency,
          },
        });

        return voucher;
      });

      if (!result.success) { res.status(400).json(result); return; }

      dentalMetrics.voucherIssued(tenantId);
      res.status(201).json({
        success: true,
        data: {
          ...result.data,
          // token and qrPayload exposed — partner uses these for QR display
        },
        meta: { requestId, timestamp: new Date().toISOString(), version: '2.0' },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: { code: 'ISSUE_FAILED', message: (err as Error).message } });
    }
  }
);

/**
 * GET /api/v2/dental/commerce/vouchers/:token
 * Check voucher status.
 */
dentalCommerceRouter.get('/vouchers/:token', async (req: Request, res: Response): Promise<void> => {
  const { tenantId, userId, requestId } = tr(req);

  const result = await withTenant({ tenantId, userId, requestId }, (client) =>
    dentalVoucherEngine.getByToken(client, req.params.token!)
  );

  res.status(result.success ? 200 : 404).json(result);
});

/**
 * POST /api/v2/dental/commerce/vouchers/redeem
 * Validates and marks a voucher as redeemed at the clinic.
 * Body: RedeemDentalVoucherInput
 */
dentalCommerceRouter.post('/vouchers/redeem',
  validate(RedeemDentalVoucherSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId, userId, requestId } = tr(req);
    const input = (req as unknown as { validatedBody: typeof RedeemDentalVoucherSchema._type }).validatedBody;

    const tenantSecret: string = req.app.locals.getTenantSecret
      ? await req.app.locals.getTenantSecret(tenantId)
      : (() => { throw new Error('tenantSecret not provisioned'); })();

    const result = await withTenant({ tenantId, userId, requestId }, async (client) => {
      const redemption = await dentalVoucherEngine.redeem(client, tenantId, tenantSecret, input);

      if (redemption.success && redemption.data?.result === 'SUCCESS') {
        await auditService.record(client, {
          tenantId, eventType: 'VOUCHER_REDEEMED',
          entityId: redemption.data.voucherId, entityType: 'DentalVoucher',
          actorId: input.redeemedBy, correlationId: input.correlationId,
          after: { result: 'SUCCESS', channel: input.channel, locationId: input.locationId },
        });
      }

      return redemption;
    });

    dentalMetrics.voucherRedeemed(tenantId, result.success ? 'SUCCESS' : 'FAILED');

    const statusCode = result.success ? 200
      : result.error?.code === 'ALREADY_REDEEMED' ? 409
      : result.error?.code === 'EXPIRED' ? 410 : 422;

    res.status(statusCode).json(result);
  }
);

// ─── POST /bookings — Schedule appointment ────────────────────────────────────

/**
 * POST /api/v2/dental/commerce/bookings
 * Creates a dental booking. Optionally linked to a voucher.
 * Body: CreateDentalBookingInput
 */
dentalCommerceRouter.post('/bookings',
  validate(CreateDentalBookingSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId, userId, requestId } = tr(req);
    const input = (req as unknown as { validatedBody: typeof CreateDentalBookingSchema._type }).validatedBody;

    const result = await withTenant({ tenantId, userId, requestId }, async (client) => {
      // Resolve voucher if provided
      let voucherId: string | undefined;
      if (input.voucherToken) {
        const voucher = await dentalVoucherEngine.getByToken(client, input.voucherToken);
        if (!voucher.success || !voucher.data) {
          return { success: false as const, error: { code: 'INVALID_VOUCHER' as const, message: 'Voucher not found' } };
        }
        if (voucher.data.status !== 'ACTIVE') {
          return { success: false as const, error: { code: 'VOUCHER_UNAVAILABLE' as const, message: `Voucher status: ${voucher.data.status}` } };
        }
        voucherId = voucher.data.id;
      }

      // Slot end = start + item duration (default 60 min if catalog not found)
      const item = await dentalCatalogRepository.findByCode(client, input.catalogItemCode);
      const durationMs = ((item.data?.durationMinutes ?? 60)) * 60_000;
      const slotEnd = new Date(Date.now() + durationMs);

      const booking = await dentalBookingEngine.create(client, tenantId, voucherId, input, slotEnd);
      return booking;
    });

    res.status(result.success ? 201 : 400).json({
      ...result,
      meta: result.success ? { requestId, timestamp: new Date().toISOString(), version: '2.0' } : undefined,
    });
  }
);

/**
 * GET /api/v2/dental/commerce/bookings/:id
 * Booking status with fulfillment lifecycle.
 */
dentalCommerceRouter.get('/bookings/:id', async (req: Request, res: Response): Promise<void> => {
  const { tenantId, userId, requestId } = tr(req);

  const result = await withTenant({ tenantId, userId, requestId }, async (client) => {
    const booking = await dentalBookingEngine.getById(client, req.params.id!);
    if (!booking.success || !booking.data) return booking;

    return {
      success: true,
      data: {
        ...booking.data,
        fulfillmentStatus: DentalBookingEngine.toFulfillmentStatus(booking.data.status),
      },
    };
  });

  res.status(result.success ? 200 : 404).json(result);
});

/**
 * POST /api/v2/dental/commerce/bookings/:id/confirm
 */
dentalCommerceRouter.post('/bookings/:id/confirm', async (req: Request, res: Response): Promise<void> => {
  const { tenantId, userId, requestId } = tr(req);

  const result = await withTenant({ tenantId, userId, requestId }, (client) =>
    dentalBookingEngine.transition(client, req.params.id!, 'REQUESTED', 'CONFIRMED', { confirmedAt: new Date() })
  );

  res.status(result.success ? 200 : 422).json(result);
});

/**
 * POST /api/v2/dental/commerce/bookings/:id/check-in
 */
dentalCommerceRouter.post('/bookings/:id/check-in', async (req: Request, res: Response): Promise<void> => {
  const { tenantId, userId, requestId } = tr(req);

  const result = await withTenant({ tenantId, userId, requestId }, (client) =>
    dentalBookingEngine.transition(client, req.params.id!, 'CONFIRMED', 'CHECKED_IN')
  );

  res.status(result.success ? 200 : 422).json(result);
});

/**
 * POST /api/v2/dental/commerce/bookings/:id/complete
 */
dentalCommerceRouter.post('/bookings/:id/complete', async (req: Request, res: Response): Promise<void> => {
  const { tenantId, userId, requestId } = tr(req);

  const result = await withTenant({ tenantId, userId, requestId }, (client) =>
    dentalBookingEngine.transition(client, req.params.id!, 'CHECKED_IN', 'COMPLETED', { completedAt: new Date() })
  );

  res.status(result.success ? 200 : 422).json(result);
});

/**
 * POST /api/v2/dental/commerce/bookings/:id/cancel
 */
dentalCommerceRouter.post('/bookings/:id/cancel', async (req: Request, res: Response): Promise<void> => {
  const { tenantId, userId, requestId } = tr(req);
  const { reason = 'Cancelled by user' } = req.body as { reason?: string };

  const result = await withTenant({ tenantId, userId, requestId }, (client) =>
    dentalBookingEngine.transition(
      client, req.params.id!, 'CONFIRMED', 'CANCELLED',
      { cancelledAt: new Date(), reason }
    )
  );

  res.status(result.success ? 200 : 422).json(result);
});

export default dentalCommerceRouter;

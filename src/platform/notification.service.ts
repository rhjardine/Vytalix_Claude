// =============================================================================
// src/platform/notification.service.ts
// Non-blocking notification dispatch for payment and appointment events.
//
// Architecture (identical pattern to metering.service.ts):
//   - All sends are fire-and-forget — callers NEVER await
//   - A notification failure NEVER blocks a request or pipeline step
//   - Provider is selected by NOTIFICATION_PROVIDER env var:
//       log      — structured log only (default, no external deps)
//       sendgrid — email via SendGrid API (requires SENDGRID_API_KEY)
//       twilio   — WhatsApp via Twilio Conversations (requires TWILIO_*)
//
// Add real provider credentials to activate channels.
// =============================================================================

import { logger } from './logger'

// ── Notification types ─────────────────────────────────────────────

export interface PaymentConfirmedNotification {
  readonly type: 'PAYMENT_CONFIRMED'
  readonly subjectRef: string
  readonly tenantId: string
  readonly amount: number
  readonly currency: string
  readonly product: string
  readonly correlationId: string
}

export interface AppointmentBookedNotification {
  readonly type: 'APPOINTMENT_BOOKED'
  readonly subjectRef: string
  readonly tenantId: string
  readonly appointmentId: string
  readonly specialty: string
  readonly scheduledFor?: string
  readonly correlationId: string
}

export interface ServiceActivatedNotification {
  readonly type: 'SERVICE_ACTIVATED'
  readonly subjectRef: string
  readonly tenantId: string
  readonly plan: string
  readonly correlationId: string
}

export type VytalixNotification =
  | PaymentConfirmedNotification
  | AppointmentBookedNotification
  | ServiceActivatedNotification

// ── Provider implementations ────────────────────────────────────────

async function sendViaLog(notification: VytalixNotification): Promise<void> {
  logger.info(
    {
      notificationType: notification.type,
      subjectRef: notification.subjectRef,
      tenantId: notification.tenantId,
      correlationId: notification.correlationId,
    },
    `[NOTIFICATION] ${notification.type}`,
  )
}

async function sendViaSendGrid(notification: VytalixNotification): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY
  if (!apiKey) {
    logger.warn({ notificationType: notification.type }, 'SENDGRID_API_KEY not set — falling back to log provider')
    return sendViaLog(notification)
  }

  // Dynamic import — avoids hard dep when not using SendGrid
  const { default: sgMail } = await import('@sendgrid/mail' as string)
  sgMail.setApiKey(apiKey)

  const fromEmail = process.env.SENDGRID_FROM_EMAIL ?? 'noreply@vytalix.health'

  await sgMail.send({
    to:      notification.subjectRef, // In production: resolve subjectRef → email via patient profile
    from:    fromEmail,
    subject: notificationSubject(notification.type),
    text:    buildTextBody(notification),
  })

  logger.info(
    { notificationType: notification.type, subjectRef: notification.subjectRef },
    'SendGrid email sent',
  )
}

async function sendViaTwilio(notification: VytalixNotification): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const from       = process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886'

  if (!accountSid || !authToken) {
    logger.warn({ notificationType: notification.type }, 'Twilio credentials not set — falling back to log provider')
    return sendViaLog(notification)
  }

  const { default: twilio } = await import('twilio' as string)
  const client = twilio(accountSid, authToken)

  const to = `whatsapp:${notification.subjectRef}` // In production: resolve subjectRef → phone

  await client.messages.create({
    from,
    to,
    body: buildTextBody(notification),
  })

  logger.info(
    { notificationType: notification.type, subjectRef: notification.subjectRef },
    'Twilio WhatsApp sent',
  )
}

// ── Helpers ─────────────────────────────────────────────────────────

function notificationSubject(type: VytalixNotification['type']): string {
  const subjects: Record<VytalixNotification['type'], string> = {
    PAYMENT_CONFIRMED:    'Pago confirmado — Vytalix',
    APPOINTMENT_BOOKED:   'Tu cita está programada — Vytalix',
    SERVICE_ACTIVATED:    'Tu servicio ha sido activado — Vytalix',
  }
  return subjects[type] ?? 'Notificación — Vytalix'
}

function buildTextBody(notification: VytalixNotification): string {
  switch (notification.type) {
    case 'PAYMENT_CONFIRMED':
      return `Tu pago de ${(notification.amount / 100).toFixed(2)} ${notification.currency} para ${notification.product} ha sido confirmado.`
    case 'APPOINTMENT_BOOKED':
      return `Tu cita (${notification.specialty}) ha sido agendada${notification.scheduledFor ? ` para el ${notification.scheduledFor}` : ''}. ID: ${notification.appointmentId}`
    case 'SERVICE_ACTIVATED':
      return `Tu plan ${notification.plan} ha sido activado exitosamente.`
  }
}

async function dispatch(notification: VytalixNotification): Promise<void> {
  const provider = process.env.NOTIFICATION_PROVIDER ?? 'log'

  try {
    if (provider === 'sendgrid') return await sendViaSendGrid(notification)
    if (provider === 'twilio')   return await sendViaTwilio(notification)
    return await sendViaLog(notification)
  } catch (err) {
    // Notification failures are always swallowed — never propagate
    logger.error(
      { err, notificationType: notification.type, provider },
      'Notification dispatch failed — swallowed (non-blocking)',
    )
  }
}

// ── Public API — fire-and-forget helpers ────────────────────────────

export const notificationService = {
  paymentConfirmed: (n: Omit<PaymentConfirmedNotification, 'type'>): void => {
    dispatch({ type: 'PAYMENT_CONFIRMED', ...n }).catch(() => {})
  },

  appointmentBooked: (n: Omit<AppointmentBookedNotification, 'type'>): void => {
    dispatch({ type: 'APPOINTMENT_BOOKED', ...n }).catch(() => {})
  },

  serviceActivated: (n: Omit<ServiceActivatedNotification, 'type'>): void => {
    dispatch({ type: 'SERVICE_ACTIVATED', ...n }).catch(() => {})
  },
}

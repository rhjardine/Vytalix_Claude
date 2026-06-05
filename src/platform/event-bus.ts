// =============================================================================
// Vytalix Internal Event Bus
//
// Design: EventEmitter in process today → AWS EventBridge in production.
// The public interface (publish/subscribe) is identical in both modes.
// Switching transports requires changing ONE line (the bus factory).
//
// Events are strongly typed. Every event has:
//   - eventType: string discriminator
//   - tenantId: required for all clinical events (RLS awareness)
//   - correlationId: traces requests across the pipeline
//   - occurredAt: immutable timestamp set at publication time
//   - version: event schema version for consumer compatibility
//
// Consumers that receive unknown eventTypes should log and discard (open/closed).
// =============================================================================

import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { logger } from './logger'

// ─────────────────────────────────────────────────────────────────
// Event schema definitions
// ─────────────────────────────────────────────────────────────────

interface BaseEvent {
  readonly eventId: string
  readonly tenantId: string
  readonly correlationId: string
  readonly occurredAt: string    // ISO-8601 UTC
  readonly version: '1.0'
}

export interface PatientCreatedEvent extends BaseEvent {
  readonly eventType: 'PatientCreated'
  readonly payload: {
    readonly patientId: string
    readonly organizationId: string
    readonly mrn: string
  }
}

export interface ObservationAddedEvent extends BaseEvent {
  readonly eventType: 'ObservationAdded'
  readonly payload: {
    readonly observationId: string
    readonly patientId: string
    readonly loincCode: string
    readonly valueNumeric: number | null
    readonly unit: string | null
    readonly observedAt: string
    readonly sourceSystem: string
  }
}

export interface PatientModelUpdatedEvent extends BaseEvent {
  readonly eventType: 'PatientModelUpdated'
  readonly payload: {
    readonly patientId: string
    readonly snapshotVersion: number
    readonly updatedFields: string[]
    readonly triggeredByObservationId: string | null
  }
}

export interface DecisionGeneratedEvent extends BaseEvent {
  readonly eventType: 'DecisionGenerated'
  readonly payload: {
    readonly recommendationId: string
    readonly patientId: string
    readonly ruleId: string
    readonly urgency: string
    readonly category: string
    readonly decisionTraceId: string
  }
}

export interface RiskScoreComputedEvent extends BaseEvent {
  readonly eventType: 'RiskScoreComputed'
  readonly payload: {
    readonly riskScoreId: string
    readonly patientId: string
    readonly scoreType: string
    readonly riskCategory: string
    readonly valuePercent: number
  }
}

export interface RecommendationReviewedEvent extends BaseEvent {
  readonly eventType: 'RecommendationReviewed'
  readonly payload: {
    readonly recommendationId: string
    readonly patientId: string
    readonly physicianId: string
    readonly action: string
    readonly rationaleCode: string | null
  }
}

// Union type — exhaustive discriminated union
export type VytalixEvent =
  | PatientCreatedEvent
  | ObservationAddedEvent
  | PatientModelUpdatedEvent
  | DecisionGeneratedEvent
  | RiskScoreComputedEvent
  | RecommendationReviewedEvent

export type VytalixEventType = VytalixEvent['eventType']

// ─────────────────────────────────────────────────────────────────
// Bus interface — identical for local and EventBridge transports
// ─────────────────────────────────────────────────────────────────

export interface IEventBus {
  publish<T extends VytalixEvent>(event: Omit<T, 'eventId' | 'occurredAt' | 'version'>): void
  subscribe<T extends VytalixEvent>(
    eventType: T['eventType'],
    handler: (event: T) => Promise<void>
  ): void
  unsubscribe(eventType: VytalixEventType, handler: (...args: any[]) => void): void
}

// ─────────────────────────────────────────────────────────────────
// Local EventEmitter bus (development + test + MVP)
// ─────────────────────────────────────────────────────────────────

class LocalEventBus implements IEventBus {
  private emitter = new EventEmitter()

  constructor() {
    // Raise the listener limit — each eventType can have many subscribers
    this.emitter.setMaxListeners(50)
  }

  publish<T extends VytalixEvent>(
    partial: Omit<T, 'eventId' | 'occurredAt' | 'version'>
  ): void {
    const event: T = {
      ...partial,
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      version: '1.0',
    } as T

    logger.debug(
      { eventType: event.eventType, tenantId: event.tenantId, correlationId: event.correlationId },
      'Event published'
    )

    // Emit synchronously in process — handlers run in sequence
    this.emitter.emit(event.eventType, event)

    // Also emit a wildcard for logging/tracing subscribers
    this.emitter.emit('*', event)
  }

  subscribe<T extends VytalixEvent>(
    eventType: T['eventType'],
    handler: (event: T) => Promise<void>
  ): void {
    // Wrap async handler to catch errors without crashing the emitter
    const wrapped = async (event: T) => {
      try {
        await handler(event)
      } catch (err) {
        logger.error(
          { eventType, eventId: event.eventId, err },
          'Event handler threw — event processing failed'
        )
      }
    }

    this.emitter.on(eventType, wrapped)
  }

  unsubscribe(eventType: VytalixEventType, handler: (...args: any[]) => void): void {
    this.emitter.removeListener(eventType, handler)
  }

  /** Dev/test utility — subscribe to ALL events */
  subscribeAll(handler: (event: VytalixEvent) => void): void {
    this.emitter.on('*', handler)
  }
}

// ─────────────────────────────────────────────────────────────────
// EventBridge stub (production transport — swap in at deploy time)
// Uncomment and configure AWS SDK when ready for production.
// ─────────────────────────────────────────────────────────────────

// class EventBridgeBus implements IEventBus {
//   private client = new EventBridgeClient({ region: process.env.AWS_REGION })
//   private eventBusName = process.env.EVENTBRIDGE_BUS_NAME ?? 'vytalix-clinical'
//
//   publish<T extends VytalixEvent>(partial: Omit<T, 'eventId' | 'occurredAt' | 'version'>): void {
//     const event = { ...partial, eventId: randomUUID(), occurredAt: new Date().toISOString(), version: '1.0' } as T
//     this.client.send(new PutEventsCommand({
//       Entries: [{
//         EventBusName: this.eventBusName,
//         Source: 'vytalix.clinical-engine',
//         DetailType: event.eventType,
//         Detail: JSON.stringify(event),
//       }]
//     })).catch(err => logger.error({ err }, 'EventBridge publish failed'))
//   }
//
//   subscribe() { /* EventBridge uses Lambda triggers, not in-process subscriptions */ }
//   unsubscribe() {}
// }

// ─────────────────────────────────────────────────────────────────
// Singleton — one bus per process
// ─────────────────────────────────────────────────────────────────

const busInstance: IEventBus = new LocalEventBus()

export const eventBus = busInstance

// ─────────────────────────────────────────────────────────────────
// Publisher helpers — typed factory functions for each event type
// Usage: publish.observationAdded({ tenantId, correlationId, payload })
// ─────────────────────────────────────────────────────────────────

type EventBase = { tenantId: string; correlationId: string }

export const publish = {
  patientCreated: (base: EventBase, payload: PatientCreatedEvent['payload']) =>
    eventBus.publish<PatientCreatedEvent>({ eventType: 'PatientCreated', ...base, payload }),

  observationAdded: (base: EventBase, payload: ObservationAddedEvent['payload']) =>
    eventBus.publish<ObservationAddedEvent>({ eventType: 'ObservationAdded', ...base, payload }),

  patientModelUpdated: (base: EventBase, payload: PatientModelUpdatedEvent['payload']) =>
    eventBus.publish<PatientModelUpdatedEvent>({ eventType: 'PatientModelUpdated', ...base, payload }),

  decisionGenerated: (base: EventBase, payload: DecisionGeneratedEvent['payload']) =>
    eventBus.publish<DecisionGeneratedEvent>({ eventType: 'DecisionGenerated', ...base, payload }),

  riskScoreComputed: (base: EventBase, payload: RiskScoreComputedEvent['payload']) =>
    eventBus.publish<RiskScoreComputedEvent>({ eventType: 'RiskScoreComputed', ...base, payload }),

  recommendationReviewed: (base: EventBase, payload: RecommendationReviewedEvent['payload']) =>
    eventBus.publish<RecommendationReviewedEvent>({ eventType: 'RecommendationReviewed', ...base, payload }),
}

// ─────────────────────────────────────────────────────────────────
// Wire up core pipeline subscriptions
// Called once at application startup (server.ts / app bootstrap)
// ─────────────────────────────────────────────────────────────────

export function registerCoreSubscriptions(): void {
  const { PipelineOrchestrator } = require('../api/pipelines/orchestrator')
  const orchestrator = new PipelineOrchestrator()

  // ObservationAdded → trigger full pipeline for that patient
  eventBus.subscribe<ObservationAddedEvent>(
    'ObservationAdded',
    async (event) => {
      logger.info(
        { correlationId: event.correlationId, patientId: event.payload.patientId },
        'ObservationAdded → triggering pipeline'
      )
      await orchestrator.runFromObservation(
        event.tenantId,
        event.payload.patientId,
        event.correlationId
      )
    }
  )

  // DecisionGenerated → structured log for audit stream
  eventBus.subscribe<DecisionGeneratedEvent>(
    'DecisionGenerated',
    async (event) => {
      logger.info(
        {
          correlationId: event.correlationId,
          tenantId: event.tenantId,
          recommendationId: event.payload.recommendationId,
          urgency: event.payload.urgency,
          category: event.payload.category,
        },
        'DecisionGenerated audit entry'
      )
    }
  )

  logger.info('Core event subscriptions registered')
}

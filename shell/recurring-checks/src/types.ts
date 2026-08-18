export type RecurringCheckCadence = "daily" | "weekly";

/** Alert payloads are operational state and must not contain secrets. */
export interface RecurringAlert {
  /** Stable for one condition episode; change it when the condition changes. */
  dedupeKey: string;
  title: string;
  body: string;
  html?: string | undefined;
  sensitivity?: "normal" | "secret" | undefined;
  /** Override the check-level Inbox projection policy for this alert. */
  includeInInbox?: boolean | undefined;
}

export interface RecurringCheckResult {
  alerts?: RecurringAlert[] | undefined;
}

export interface RecurringCheckRunContext {
  /** Aborted when the caller cancels or the recurring-check daemon stops. */
  signal: AbortSignal;
}

export interface RecurringCheckDefinition {
  id: string;
  cadence: RecurringCheckCadence;
  /** Deliver returned alerts and retry pending alerts. False suppresses notification delivery. Defaults to true. */
  deliverAlerts?: boolean | undefined;
  /** Project returned alerts into the shared Inbox. Defaults to true. */
  includeInInbox?: boolean | undefined;
  run(context: RecurringCheckRunContext): Promise<RecurringCheckResult>;
}

export interface RecurringCheckOpenAlert {
  /** Opaque stable ID for one condition episode. */
  id: string;
  checkId: string;
  title: string;
  body: string;
  observedAt: string;
}

export interface IRecurringChecksNamespace {
  /** Register a plugin-owned recurring check. Returns an unregister callback. */
  register(check: RecurringCheckDefinition): () => void;
}

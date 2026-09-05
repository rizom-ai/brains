import { z } from "@brains/utils/zod";

export type RecurringCheckCadence = "daily" | "weekly";

/** Alert payloads are operational state and must not contain secrets. */
export const recurringAlertSchema: z.ZodObject<
  {
    dedupeKey: z.ZodString;
    title: z.ZodString;
    body: z.ZodString;
    html: z.ZodOptional<z.ZodString>;
    sensitivity: z.ZodOptional<
      z.ZodEnum<{ normal: "normal"; secret: "secret" }>
    >;
    includeInInbox: z.ZodOptional<z.ZodBoolean>;
  },
  z.core.$strict
> = z.strictObject({
  /** Stable for one condition episode; change it when the condition changes. */
  dedupeKey: z.string().min(1).max(512),
  title: z.string().min(1),
  body: z.string().min(1),
  html: z.string().min(1).optional(),
  sensitivity: z.enum(["normal", "secret"]).optional(),
  /** Override the check-level Inbox projection policy for this alert. */
  includeInInbox: z.boolean().optional(),
});

export type RecurringAlert = z.output<typeof recurringAlertSchema>;

export const recurringCheckResultSchema: z.ZodObject<
  { alerts: z.ZodOptional<z.ZodArray<typeof recurringAlertSchema>> },
  z.core.$strict
> = z.strictObject({
  alerts: z.array(recurringAlertSchema).optional(),
});

export type RecurringCheckResult = z.output<typeof recurringCheckResultSchema>;

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

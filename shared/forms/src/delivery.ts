import type { IRuntimeStateNamespace } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  FormStorageSlots,
  formStoragePolicySchema,
  type FormStorageOptions,
  type FormStoragePolicy,
} from "./storage-slots";

export interface FormDeliveryPolicy {
  maxAttempts: number;
  retryWindowSeconds: number;
}
export const formDeliveryPolicyShape: z.ZodObject<
  { maxAttempts: z.ZodNumber; retryWindowSeconds: z.ZodNumber },
  z.core.$strict
> = z.strictObject({
  maxAttempts: z.number().int().min(1).max(5),
  // Must fit inside the approved transport's idempotency retention (email: 24h).
  retryWindowSeconds: z.number().int().min(60).max(3600),
});
export const formDeliveryPolicySchema: z.ZodType<FormDeliveryPolicy> =
  formDeliveryPolicyShape;
/** A sent alert, or why it was not sent as a short code without submitted content. */
export type FormAlertOutcome =
  { sent: true } | { sent: false; failure: string };
export type FormNotificationState = "pending" | "sent" | "failed";

/** The package that owns a form's records: it reads and writes its own type. */
export interface FormDeliveryTarget {
  /** The stored submission's notification state, or null when it is gone. */
  notification(id: string): Promise<FormNotificationState | null>;
  /** Record a settled delivery on the stored submission. */
  recordNotification(
    id: string,
    status: "sent" | "failed",
    signal: AbortSignal,
  ): Promise<void>;
}

export interface FormDeliveryDependencies {
  target: FormDeliveryTarget;
  state: IRuntimeStateNamespace;
  storage: FormStoragePolicy;
  slots: FormStorageOptions;
  policy: FormDeliveryPolicy;
  send: (id: string, idempotencyKey: string) => Promise<FormAlertOutcome>;
  now?: () => number;
}

export class FormDelivery {
  private readonly deps: FormDeliveryDependencies;
  private readonly slots: FormStorageSlots;
  private readonly policy: FormDeliveryPolicy;
  private readonly now: () => number;
  constructor(deps: FormDeliveryDependencies) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
    this.policy = formDeliveryPolicySchema.parse(deps.policy);
    this.slots = new FormStorageSlots(
      deps.state,
      formStoragePolicySchema.parse(deps.storage),
      deps.slots,
      this.now,
    );
  }

  async deliver(
    id: string,
    signal: AbortSignal,
  ): Promise<"sent" | "failed" | "skipped"> {
    try {
      signal.throwIfAborted();
      const state = await this.deps.target.notification(id);
      if (state === null) return "skipped";
      if (state === "sent") return "sent";
      const claim = await this.slots.beginDelivery(
        id,
        this.policy.maxAttempts,
        this.policy.retryWindowSeconds,
      );
      if (claim.status === "skipped") return "skipped";
      if (claim.status === "busy") throw new Error("Busy");
      let status: "sent" | "failed";
      if (claim.status === "send") {
        signal.throwIfAborted();
        const current = await this.deps.target.notification(id);
        signal.throwIfAborted();
        if (current === null) return "skipped";
        // A slow read must not turn a once-valid reservation into a late send.
        if (this.now() >= claim.sendBefore) throw new Error("Expired attempt");
        let outcome: FormAlertOutcome = { sent: false, failure: "unconfirmed" };
        try {
          outcome = await this.deps.send(
            id,
            `${this.deps.slots.idPrefix}-notification:${id}`,
          );
        } catch {
          /* Ambiguous delivery: preserve key and charged attempt. */
        }
        // Persist a known acknowledgement even if cancellation happened during I/O.
        const settled = await this.slots.settleDelivery(
          id,
          claim.attempt,
          outcome.sent,
          this.policy.maxAttempts,
          outcome.sent ? undefined : outcome.failure,
        );
        if (!settled) return "skipped";
        if (settled === "pending") throw new Error("Pending");
        status = settled;
      } else {
        status = claim.status;
      }
      await this.deps.target.recordNotification(id, status, signal);
      return status;
    } catch {
      throw new Error("Form notification unavailable");
    }
  }
}

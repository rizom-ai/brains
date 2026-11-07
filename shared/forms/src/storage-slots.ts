import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";

/** The ledger's ceiling: submissions whose write or alert has not settled. */
const MAX_IN_FLIGHT = 1000;
export type FormDeliveryStatus = "pending" | "sent" | "failed";
interface DeliveryState {
  attempts: number;
  firstAttemptAt: number | null;
  leaseUntil: number;
  status: FormDeliveryStatus;
  /** Why the latest attempt failed: a short code, never message content. */
  failure?: string | undefined;
}
export type DeliveryClaim =
  | { status: "send"; attempt: number; sendBefore: number }
  | { status: "skipped" | "busy" | "sent" | "failed" };

export interface FormStorageSlot {
  receivedAt: number;
  bytes: number;
  phase: "writing" | "stored";
  delivery: DeliveryState;
}
interface SlotState {
  revision: number;
  lastNow: number;
  slots: Record<string, FormStorageSlot>;
}
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const slotSchema: z.ZodType<FormStorageSlot> = z
  .strictObject({
    receivedAt: integer,
    // Written while submissions expired; read, never written.
    expiresAt: integer.optional(),
    bytes: integer.max(32000),
    phase: z.enum(["writing", "stored"]),
    delivery: z.strictObject({
      attempts: integer.max(5),
      firstAttemptAt: integer.nullable(),
      leaseUntil: integer,
      status: z.enum(["pending", "sent", "failed"]),
      failure: z
        .string()
        .regex(/^[a-z0-9_:.-]{1,80}$/)
        .optional(),
    }),
  })
  .transform(({ expiresAt: _expiresAt, ...slot }) => slot);
function stateSchemaFor(idPrefix: string): z.ZodType<SlotState> {
  const escaped = idPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return z.strictObject({
    revision: integer,
    lastNow: integer,
    slots: z
      .record(
        z.string().regex(new RegExp(`^${escaped}-[a-f0-9]{64}$`)),
        slotSchema,
      )
      .refine((slots) => Object.keys(slots).length <= MAX_IN_FLIGHT),
  });
}
/** Where a form's slot ledger lives and how its records are named. */
export interface FormStorageOptions {
  namespace: string;
  idPrefix: string;
  /** Fewer than the ledger's ceiling, for tests. */
  maxInFlight?: number | undefined;
}
export type SlotClaim =
  { kind: "new" | "existing"; slot: FormStorageSlot } | { kind: "capacity" };

/** Submissions are kept until their owner deletes them; a slot covers only the
 * work still in flight for one: its write, then its alert. Never prune an
 * uncertain writer merely because time passed: a delayed create may still
 * commit.
 */
export class FormStorageSlots {
  private readonly store: IRuntimeStateStore<SlotState>;
  private readonly maxInFlight: number;
  private readonly now: () => number;
  constructor(
    state: IRuntimeStateNamespace,
    options: FormStorageOptions,
    now: () => number,
  ) {
    this.maxInFlight = Math.min(
      options.maxInFlight ?? MAX_IN_FLIGHT,
      MAX_IN_FLIGHT,
    );
    this.now = now;
    this.store = state.scoped({
      namespace: options.namespace,
      schema: stateSchemaFor(options.idPrefix),
    });
  }

  claim(id: string, receivedAt: number, bytes: number): Promise<SlotClaim> {
    return this.mutate<SlotClaim>((state) => {
      const existing = state.slots[id];
      if (existing) return { result: { kind: "existing", slot: existing } };
      if (Object.keys(state.slots).length >= this.maxInFlight || bytes > 32000)
        return { result: { kind: "capacity" } };
      const slot: FormStorageSlot = {
        receivedAt,
        bytes,
        phase: "writing",
        delivery: {
          attempts: 0,
          firstAttemptAt: null,
          leaseUntil: 0,
          status: "pending",
        },
      };
      return {
        result: { kind: "new", slot },
        next: { ...state, slots: { ...state.slots, [id]: slot } },
      };
    });
  }

  async list(): Promise<Array<[string, FormStorageSlot]>> {
    return Object.entries((await this.store.get("slots"))?.slots ?? {});
  }

  async assertWritable(id: string): Promise<void> {
    const slot = (await this.store.get("slots"))?.slots[id];
    if (slot?.phase !== "writing" || this.now() < slot.receivedAt)
      throw new Error("Form write unavailable");
  }

  stored(id: string): Promise<boolean> {
    return this.mutate((state) => {
      const slot = state.slots[id];
      if (!slot) return { result: false };
      if (slot.phase === "stored") return { result: true };
      return {
        result: true,
        next: {
          ...state,
          slots: { ...state.slots, [id]: { ...slot, phase: "stored" } },
        },
      };
    });
  }

  /** Reserve before external I/O. Attempts and the first-send horizon never reset
   * across queue retries, duplicate jobs, restarts, or an ambiguous provider result.
   */
  beginDelivery(
    id: string,
    maxAttempts: number,
    retryWindowSeconds: number,
  ): Promise<DeliveryClaim> {
    return this.mutate<DeliveryClaim>((state, now) => {
      const slot = state.slots[id];
      if (slot?.phase !== "stored") return { result: { status: "skipped" } };
      const delivery = slot.delivery;
      if (delivery.status !== "pending")
        return { result: { status: delivery.status } };
      const expired =
        delivery.firstAttemptAt !== null &&
        now >= delivery.firstAttemptAt + retryWindowSeconds * 1000;
      if (
        expired ||
        (delivery.attempts >= maxAttempts && now >= delivery.leaseUntil)
      ) {
        return {
          result: { status: "failed" },
          next: {
            ...state,
            slots: {
              ...state.slots,
              [id]: {
                ...slot,
                delivery: { ...delivery, status: "failed", leaseUntil: 0 },
              },
            },
          },
        };
      }
      if (now < delivery.leaseUntil) return { result: { status: "busy" } };
      const attempt = delivery.attempts + 1;
      return {
        result: {
          status: "send",
          attempt,
          sendBefore: Math.min(
            now + 65_000,
            (delivery.firstAttemptAt ?? now) + retryWindowSeconds * 1000,
          ),
        },
        next: {
          ...state,
          slots: {
            ...state.slots,
            [id]: {
              ...slot,
              delivery: {
                status: "pending",
                attempts: attempt,
                firstAttemptAt: delivery.firstAttemptAt ?? now,
                // Longer than the job deadline. Reclaims still use the same provider key.
                leaseUntil: now + 65_000,
              },
            },
          },
        },
      };
    });
  }

  settleDelivery(
    id: string,
    attempt: number,
    sent: boolean,
    maxAttempts: number,
    failure?: string,
  ): Promise<FormDeliveryStatus | null> {
    return this.mutate<FormDeliveryStatus | null>((state) => {
      const slot = state.slots[id];
      if (!slot) return { result: null }; // A released slot is never recreated.
      const delivery = slot.delivery;
      if (
        delivery.status === "sent" ||
        (!sent && delivery.attempts !== attempt)
      )
        return { result: delivery.status };
      const status = sent
        ? "sent"
        : delivery.attempts >= maxAttempts
          ? "failed"
          : "pending";
      return {
        result: status,
        next: {
          ...state,
          slots: {
            ...state.slots,
            [id]: {
              ...slot,
              delivery: {
                ...delivery,
                status,
                leaseUntil: 0,
                ...(!sent && failure ? { failure } : {}),
              },
            },
          },
        },
      };
    });
  }

  /** Call once the settled alert is recorded on the stored submission. A
   * pending alert or an uncertain write keeps its slot. */
  release(id: string): Promise<boolean> {
    return this.remove(
      id,
      (slot) => slot.phase === "stored" && slot.delivery.status !== "pending",
    );
  }

  /** Call only after observing that the stored submission is gone: its owner
   * deleted it, so nothing is left to alert about. */
  releaseGone(id: string): Promise<boolean> {
    return this.remove(id, (slot) => slot.phase === "stored");
  }

  private remove(
    id: string,
    releasable: (slot: FormStorageSlot) => boolean,
  ): Promise<boolean> {
    return this.mutate((state) => {
      const slot = state.slots[id];
      if (!slot) return { result: true };
      if (!releasable(slot)) return { result: false };
      const slots = { ...state.slots };
      delete slots[id];
      return { result: true, next: { ...state, slots } };
    });
  }

  private async mutate<T>(
    change: (state: SlotState, now: number) => { result: T; next?: SlotState },
  ): Promise<T> {
    const now = this.now();
    if (!Number.isSafeInteger(now) || now < 0)
      throw new Error("Form storage unavailable");
    return this.attempt(change, now, 16);
  }

  /** One compare-and-set round; losing a race tries again, a bounded number
   * of times. */
  private async attempt<T>(
    change: (state: SlotState, now: number) => { result: T; next?: SlotState },
    now: number,
    attempts: number,
  ): Promise<T> {
    if (attempts === 0) throw new Error("Form storage unavailable");
    const state = await this.store.get("slots");
    if (!state) {
      await this.store.setIfNotExists("slots", {
        revision: 0,
        lastNow: now,
        slots: {},
      });
      return this.attempt(change, now, attempts - 1);
    }
    if (now < state.lastNow || state.revision === Number.MAX_SAFE_INTEGER)
      throw new Error("Form storage unavailable");
    const changed = change(state, now);
    if (!changed.next) return changed.result;
    const written = await this.store.compareAndSet("slots", state, {
      ...changed.next,
      revision: state.revision + 1,
      lastNow: now,
    });
    return written ? changed.result : this.attempt(change, now, attempts - 1);
  }
}

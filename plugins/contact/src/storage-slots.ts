import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";

export interface ContactStoragePolicy {
  retentionSeconds: number;
  maxRecords: number;
  maxBytes: number;
}
export const contactStoragePolicySchema: z.ZodType<ContactStoragePolicy> =
  z.strictObject({
    retentionSeconds: z
      .number()
      .int()
      .min(86400)
      .max(90 * 86400),
    maxRecords: z.number().int().min(1).max(1000),
    maxBytes: z.number().int().min(1024).max(32_000_000),
  });
export type ContactDeliveryStatus = "pending" | "sent" | "failed";
interface DeliveryState {
  attempts: number;
  firstAttemptAt: number | null;
  leaseUntil: number;
  status: ContactDeliveryStatus;
}
export type DeliveryClaim =
  | { status: "send"; attempt: number; sendBefore: number }
  | { status: "skipped" | "busy" | "sent" | "failed" };

export interface ContactStorageSlot {
  receivedAt: number;
  expiresAt: number;
  bytes: number;
  phase: "writing" | "stored";
  delivery: DeliveryState;
}
interface SlotState {
  revision: number;
  lastNow: number;
  slots: Record<string, ContactStorageSlot>;
}
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const slotSchema: z.ZodType<ContactStorageSlot> = z.strictObject({
  receivedAt: integer,
  expiresAt: integer,
  bytes: integer.max(32000),
  phase: z.enum(["writing", "stored"]),
  delivery: z.strictObject({
    attempts: integer.max(5),
    firstAttemptAt: integer.nullable(),
    leaseUntil: integer,
    status: z.enum(["pending", "sent", "failed"]),
  }),
});
const stateSchema: z.ZodType<SlotState> = z.strictObject({
  revision: integer,
  lastNow: integer,
  slots: z
    .record(z.string().regex(/^contact-[a-f0-9]{64}$/), slotSchema)
    .refine((slots) => Object.keys(slots).length <= 1000),
});
export type SlotClaim =
  | { kind: "new" | "existing"; slot: ContactStorageSlot }
  | { kind: "capacity" }
  | { kind: "expired" };

/** Capacity reservations survive credential expiry. Never prune an uncertain
 * writer merely because time passed: a delayed create may still commit.
 */
export class ContactStorageSlots {
  private readonly store: IRuntimeStateStore<SlotState>;
  private readonly policy: ContactStoragePolicy;
  private readonly now: () => number;
  constructor(
    state: IRuntimeStateNamespace,
    policy: ContactStoragePolicy,
    now: () => number,
  ) {
    this.policy = policy;
    this.now = now;
    this.store = state.scoped({
      namespace: "contact.storage",
      schema: stateSchema,
    });
  }

  claim(id: string, receivedAt: number, bytes: number): Promise<SlotClaim> {
    return this.mutate<SlotClaim>((state, now) => {
      const existing = state.slots[id];
      if (existing) return { result: { kind: "existing", slot: existing } };
      const expiresAt = receivedAt + this.policy.retentionSeconds * 1000;
      if (now >= expiresAt || now < receivedAt)
        return { result: { kind: "expired" } };
      const slots = Object.values(state.slots);
      if (
        slots.length >= this.policy.maxRecords ||
        bytes > 32000 ||
        slots.reduce((sum, slot) => sum + slot.bytes, 0) + bytes >
          this.policy.maxBytes
      )
        return { result: { kind: "capacity" } };
      const slot: ContactStorageSlot = {
        receivedAt,
        expiresAt,
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

  async list(): Promise<Array<[string, ContactStorageSlot]>> {
    return Object.entries((await this.store.get("slots"))?.slots ?? {});
  }

  async assertWritable(id: string): Promise<void> {
    const slot = (await this.store.get("slots"))?.slots[id];
    if (
      slot?.phase !== "writing" ||
      this.now() < slot.receivedAt ||
      this.now() >= slot.expiresAt
    )
      throw new Error("Contact write unavailable");
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
      if (slot?.phase !== "stored" || now >= slot.expiresAt)
        return { result: { status: "skipped" } };
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
            slot.expiresAt,
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
  ): Promise<ContactDeliveryStatus | null> {
    return this.mutate<ContactDeliveryStatus | null>((state) => {
      const slot = state.slots[id];
      if (!slot) return { result: null }; // Cleanup owns deletion; never recreate delivery state.
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
            [id]: { ...slot, delivery: { ...delivery, status, leaseUntil: 0 } },
          },
        },
      };
    });
  }

  /** Call only after observing the committed entity and acknowledging its deletion. */
  releaseDeleted(id: string): Promise<boolean> {
    return this.mutate((state, now) => {
      const slot = state.slots[id];
      if (!slot) return { result: true };
      if (slot.phase !== "stored" || now < slot.expiresAt)
        return { result: false };
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
      throw new Error("Contact storage unavailable");
    for (let attempt = 0; attempt < 16; attempt++) {
      const state = await this.store.get("slots");
      if (!state) {
        await this.store.setIfNotExists("slots", {
          revision: 0,
          lastNow: now,
          slots: {},
        });
        continue;
      }
      if (now < state.lastNow || state.revision === Number.MAX_SAFE_INTEGER)
        break;
      const changed = change(state, now);
      if (!changed.next) return changed.result;
      if (
        await this.store.compareAndSet("slots", state, {
          ...changed.next,
          revision: state.revision + 1,
          lastNow: now,
        })
      )
        return changed.result;
    }
    throw new Error("Contact storage unavailable");
  }
}

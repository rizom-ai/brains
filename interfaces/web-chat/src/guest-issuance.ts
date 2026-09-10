import { createHash, randomUUID } from "node:crypto";
import { z } from "@brains/utils/zod";
import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
} from "@brains/plugins";
import {
  guestIssuanceLimitsSchema,
  type GuestIssuanceLimits,
} from "./guest-policy";

type Strict<S extends z.ZodRawShape> = z.ZodObject<S, z.core.$strict>;
const integer = z.number().int().nonnegative();
const slotSchema: Strict<{
  id: z.ZodString;
  createdAt: z.ZodNumber;
  expiresAt: z.ZodNumber;
  state: z.ZodEnum<{
    pending: "pending";
    issued: "issued";
    deleting: "deleting";
  }>;
}> = z
  .strictObject({
    id: z.string().uuid(),
    createdAt: integer,
    expiresAt: integer,
    state: z.enum(["pending", "issued", "deleting"]),
  })
  .refine(
    (slot) => slot.expiresAt > slot.createdAt,
    "Invalid credential lifetime",
  );
export const guestIssuanceStateSchema: Strict<{
  version: z.ZodLiteral<1>;
  revision: z.ZodNumber;
  policy: z.ZodString;
  enabled: z.ZodBoolean;
  lastSeenAt: z.ZodNumber;
  attempts: z.ZodArray<z.ZodNumber>;
  slots: z.ZodRecord<z.ZodString, typeof slotSchema>;
}> = z.strictObject({
  version: z.literal(1),
  revision: integer,
  policy: z.string().regex(/^[a-f0-9]{64}$/),
  enabled: z.boolean(),
  lastSeenAt: integer,
  attempts: z.array(integer),
  slots: z.record(z.string().regex(/^[a-f0-9]{64}$/), slotSchema),
});
export type GuestIssuanceState = z.output<typeof guestIssuanceStateSchema>;
type Slot = z.output<typeof slotSchema>;
export type GuestIssuanceTicket = Pick<
  Slot,
  "id" | "createdAt" | "expiresAt"
> & { key: string };
const dayMs = 86400000;
const ledgerKey = "deployment";
export const guestIssuanceNamespace = "web-chat.guest-issuance";

/** One shared ledger across origins. Materialization happens once after reserve;
 * pending writes retain capacity until the original producer acknowledges them.
 * Expiry is NOT evidence that an unacknowledged write cannot still commit.
 */
export class GuestIssuance {
  private readonly store: IRuntimeStateStore<GuestIssuanceState>;
  private readonly now: () => number;
  constructor(runtime: IRuntimeStateNamespace, now: () => number = Date.now) {
    this.store = runtime.scoped({
      namespace: guestIssuanceNamespace,
      schema: guestIssuanceStateSchema,
    });
    this.now = now;
  }

  async reserve(
    key: string,
    lifetime: Pick<Slot, "createdAt" | "expiresAt">,
    limits: GuestIssuanceLimits,
    isEmpty: () => Promise<boolean>,
  ): Promise<GuestIssuanceTicket | null> {
    const validatedLimits = guestIssuanceLimitsSchema.parse(limits);
    const policy = this.fingerprint(validatedLimits);
    const id = randomUUID();
    try {
      for (let attempt = 0; attempt < 32; attempt++) {
        const stored = await this.store.get(ledgerKey);
        const now = this.clock(stored);
        if (!stored && !(await isEmpty())) {
          // Another issuer may have initialized the ledger while this read waited.
          if (await this.store.has(ledgerKey)) continue;
          return null; // Never bootstrap over unaccounted credential records.
        }
        const state: GuestIssuanceState = stored ?? {
          version: 1,
          revision: 0,
          policy,
          enabled: true,
          lastSeenAt: now,
          attempts: [],
          slots: {},
        };
        const attempts = state.attempts.filter((time) => time > now - dayMs);
        if (
          !state.enabled ||
          state.policy !== policy ||
          state.slots[key] ||
          lifetime.createdAt > now ||
          lifetime.expiresAt <= now ||
          attempts.length >= validatedLimits.requestsPerDay ||
          attempts.filter((time) => time > now - 60000).length >=
            validatedLimits.requestsPerMinute ||
          Object.keys(state.slots).length >=
            validatedLimits.maxStoredCredentials
        )
          return null;
        const next: GuestIssuanceState = {
          ...state,
          revision: state.revision + 1,
          lastSeenAt: now,
          attempts: [...attempts, now],
          slots: {
            ...state.slots,
            [key]: {
              createdAt: lifetime.createdAt,
              expiresAt: lifetime.expiresAt,
              id,
              state: "pending",
            },
          },
        };
        const committed = stored
          ? await this.store.compareAndSet(ledgerKey, stored, next)
          : await this.store.setIfNotExists(ledgerKey, next);
        if (committed)
          return {
            key,
            id,
            createdAt: lifetime.createdAt,
            expiresAt: lifetime.expiresAt,
          };
      }
    } catch {
      // Ambiguous reservations remain charged; no guessed refunds or raw errors.
    }
    return null;
  }

  /** Only the original writer calls this, after the credential write resolves. */
  async confirm(ticket: GuestIssuanceTicket): Promise<boolean> {
    return this.mutate((state) => {
      const slot = state.slots[ticket.key];
      if (slot?.id !== ticket.id || slot.state !== "pending") return null;
      return {
        ...state,
        slots: { ...state.slots, [ticket.key]: { ...slot, state: "issued" } },
      };
    });
  }

  async isIssued(ticket: GuestIssuanceTicket): Promise<boolean> {
    try {
      const state = await this.store.get(ledgerKey);
      const now = this.clock(state);
      const slot = state?.slots[ticket.key];
      return (
        slot?.id === ticket.id &&
        slot.createdAt === ticket.createdAt &&
        slot.expiresAt === ticket.expiresAt &&
        slot.state === "issued" &&
        slot.createdAt <= now &&
        now < slot.expiresAt
      );
    } catch {
      // Storage/clock failures cannot establish ownership: deny rather than
      // grant a credential using a stale record or expose private state errors.
      return false;
    }
  }

  async beginDeletion(ticket: GuestIssuanceTicket): Promise<boolean> {
    return this.mutate((state) => {
      const slot = state.slots[ticket.key];
      if (
        slot?.id !== ticket.id ||
        slot.createdAt !== ticket.createdAt ||
        slot.expiresAt !== ticket.expiresAt ||
        slot.state === "pending"
      )
        return null;
      return {
        ...state,
        slots: { ...state.slots, [ticket.key]: { ...slot, state: "deleting" } },
      };
    });
  }

  /** Caller must have an acknowledged delete; a transport error is not enough. */
  async finishDeletion(ticket: GuestIssuanceTicket): Promise<boolean> {
    return this.mutate((state) => {
      const slot = state.slots[ticket.key];
      if (!slot) return state; // Another acknowledged deleter already released it.
      if (slot.id !== ticket.id || slot.state !== "deleting") return null;
      const slots = { ...state.slots };
      delete slots[ticket.key];
      return { ...state, slots };
    });
  }

  async isGone(ticket: GuestIssuanceTicket): Promise<boolean> {
    const state = await this.store.get(ledgerKey);
    this.clock(state);
    return state !== null && state.slots[ticket.key] === undefined;
  }

  async page(
    afterKey: string | undefined,
    limit: number,
  ): Promise<{
    records: Array<GuestIssuanceTicket & Pick<Slot, "state">>;
    uncertain: number;
  }> {
    const stored = await this.store.get(ledgerKey);
    if (stored && !(await this.mutate((state) => state)))
      throw new Error("Guest access unavailable");
    const state = await this.store.get(ledgerKey);
    const now = this.clock(state);
    const slots = state?.slots ?? {};
    const uncertain = Object.values(slots).filter(
      (slot) => slot.state === "pending" && slot.expiresAt <= now,
    ).length;
    const records = Object.entries(slots)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .filter(([key]) => afterKey === undefined || key > afterKey)
      .slice(0, limit)
      .map(([key, slot]) => ({ key, ...slot }));
    return { records, uncertain };
  }

  /** Explicit operator action, not automatic adoption during a restart. */
  async applyPolicy(
    limits: GuestIssuanceLimits,
    enabled: boolean,
  ): Promise<boolean> {
    return this.mutate((state) => ({
      ...state,
      policy: this.fingerprint(limits),
      enabled,
    }));
  }

  private async mutate(
    change: (state: GuestIssuanceState) => GuestIssuanceState | null,
  ): Promise<boolean> {
    try {
      for (let attempt = 0; attempt < 32; attempt++) {
        const state = await this.store.get(ledgerKey);
        if (!state) return false;
        const now = this.clock(state);
        const changed = change(state);
        if (!changed) return false;
        const next = {
          ...changed,
          revision: state.revision + 1,
          lastSeenAt: now,
          attempts: changed.attempts.filter((time) => time > now - dayMs),
        };
        if (await this.store.compareAndSet(ledgerKey, state, next)) return true;
      }
    } catch {
      // Keep unknown writes/deletes reserved and report only safe availability.
    }
    return false;
  }

  private clock(state: GuestIssuanceState | null): number {
    const now = this.now();
    if (
      !Number.isSafeInteger(now) ||
      now < 0 ||
      (state && now < state.lastSeenAt)
    )
      throw new Error("Guest access unavailable");
    return now;
  }
  private fingerprint(limits: GuestIssuanceLimits): string {
    return createHash("sha256")
      .update(JSON.stringify(guestIssuanceLimitsSchema.parse(limits)))
      .digest("hex");
  }
}

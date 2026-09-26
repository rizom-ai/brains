import { createHash, randomBytes } from "node:crypto";
import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  guestTurnCostSchema,
  guestTurnUsageSchema,
  type GuestTurnSettlement,
} from "@brains/contracts/chat";
import { attempt, retry } from "./cas-retry";
import type { GuestUsageBounds } from "./guest-policy";

export type { GuestUsageBounds } from "./guest-policy";

const LEDGER_NAMESPACE = "web-chat.guest-usage.ledger";
const EVENTS_NAMESPACE = "web-chat.guest-usage.events";
const LEDGER_KEY = "ledger";
const ATTEMPTS = 32;

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const millis = z.number().int().nonnegative();

/** Capacity accounting: every held record has a place, taken before admission. */
const ledgerSchema = z.strictObject({
  version: z.literal(1),
  /** Per-deployment salt, so a visitor digest means nothing elsewhere. */
  salt: digestSchema,
  places: z.record(
    digestSchema,
    z.strictObject({ openedAt: millis, retainUntil: millis }),
  ),
});
type Ledger = z.output<typeof ledgerSchema>;

export const guestUsageStateSchema: z.ZodEnum<{
  pending: "pending";
  unresolved: "unresolved";
  completed: "completed";
  failed: "failed";
}> = z.enum(["pending", "unresolved", "completed", "failed"]);

export const guestUsageEventSchema: z.ZodObject<
  {
    version: z.ZodLiteral<1>;
    id: z.ZodString;
    openedAt: z.ZodNumber;
    retainUntil: z.ZodNumber;
    state: typeof guestUsageStateSchema;
    visitor: z.ZodOptional<z.ZodString>;
    reservedMicroUsd: z.ZodOptional<z.ZodNumber>;
    settledAt: z.ZodOptional<z.ZodNumber>;
    usage: z.ZodOptional<typeof guestTurnUsageSchema>;
    cost: z.ZodOptional<typeof guestTurnCostSchema>;
  },
  z.core.$strict
> = z.strictObject({
  version: z.literal(1),
  id: digestSchema,
  openedAt: millis,
  retainUntil: millis,
  /**
   * pending: capacity held, admission not granted yet. unresolved: admitted,
   * no outcome known. Work that stops without one stays unresolved.
   */
  state: guestUsageStateSchema,
  visitor: digestSchema.optional(),
  reservedMicroUsd: z.number().int().nonnegative().optional(),
  settledAt: millis.optional(),
  /** What the provider reported for the turn, when it reported it. */
  usage: guestTurnUsageSchema.optional(),
  /** Known from reported usage at a pinned revision, or explicitly unknown. */
  cost: guestTurnCostSchema.optional(),
});
export type GuestUsageEvent = z.output<typeof guestUsageEventSchema>;
export type GuestUsageOpening = "opened" | "exists" | "full" | "unavailable";

function digest(...parts: string[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

/**
 * The owner's record of what the public guest endpoint did. A request takes a
 * place before the admission ledger is asked, so a full or unwritable record
 * denies instead of admitting work nobody can see. It is admitted before any
 * generation and records its outcome once, before the ledger settles. It holds
 * no credential, conversation locator or reply, and names a visitor only by a
 * digest salted per deployment.
 */
export class GuestUsageRecord {
  static readonly namespaces: readonly string[] = [
    LEDGER_NAMESPACE,
    EVENTS_NAMESPACE,
  ];

  /** One record per submission, however often it is retried. */
  static id(
    origin: string,
    visitorId: string,
    conversationId: string,
    submissionId: string,
  ): string {
    return digest(
      "guest-usage",
      origin,
      visitorId,
      conversationId,
      submissionId,
    );
  }

  private readonly state: IRuntimeStateNamespace;
  private readonly bounds: GuestUsageBounds;
  private readonly now: () => number;

  constructor(
    state: IRuntimeStateNamespace,
    bounds: GuestUsageBounds,
    now: () => number,
  ) {
    this.state = state;
    this.bounds = bounds;
    this.now = now;
  }

  private ledger(): IRuntimeStateStore<Ledger> {
    return this.state.scoped({
      namespace: LEDGER_NAMESPACE,
      schema: ledgerSchema,
    });
  }

  private events(): IRuntimeStateStore<GuestUsageEvent> {
    return this.state.scoped({
      namespace: EVENTS_NAMESPACE,
      schema: guestUsageEventSchema,
    });
  }

  /** Takes a place for a request before the admission ledger is asked. */
  async open(id: string): Promise<GuestUsageOpening> {
    try {
      const ledger = this.ledger();
      const now = this.now();
      const retainUntil = now + this.bounds.retentionSeconds * 1000;
      const opening = await attempt<GuestUsageOpening>(
        ATTEMPTS,
        async () => {
          const current = await ledger.get(LEDGER_KEY);
          if (current?.places[id]) return "exists";
          if (
            current &&
            Object.keys(current.places).length >= this.bounds.maxRecords
          )
            return "full";
          const next: Ledger = {
            version: 1,
            salt: current?.salt ?? randomBytes(32).toString("hex"),
            places: {
              ...current?.places,
              [id]: { openedAt: now, retainUntil },
            },
          };
          const written = current
            ? await ledger.compareAndSet(LEDGER_KEY, current, next)
            : await ledger.setIfNotExists(LEDGER_KEY, next);
          return written ? "opened" : retry;
        },
        () => "unavailable",
      );
      if (opening !== "opened") return opening;
      await this.events().set(id, {
        version: 1,
        id,
        openedAt: now,
        retainUntil,
        state: "pending",
      });
      return "opened";
    } catch {
      // An unwritable record admits nothing; retention reclaims a place whose
      // event was never written.
      return "unavailable";
    }
  }

  /** The admission ledger granted the request: it is now unresolved until settled. */
  async admit(
    id: string,
    admitted: { visitorId: string; reservedMicroUsd: number },
  ): Promise<boolean> {
    try {
      const ledger = await this.ledger().get(LEDGER_KEY);
      if (!ledger) return false;
      const events = this.events();
      return await attempt(
        ATTEMPTS,
        async () => {
          const current = await events.get(id);
          if (!current) return false;
          if (current.state !== "pending") return true;
          return (await events.compareAndSet(id, current, {
            ...current,
            state: "unresolved",
            visitor: digest(ledger.salt, admitted.visitorId),
            reservedMicroUsd: admitted.reservedMicroUsd,
          }))
            ? true
            : retry;
        },
        () => false,
      );
    } catch {
      // Without an admission record the request must not run; the caller denies.
      return false;
    }
  }

  /** The admission ledger turned the request away: give its place back. */
  async withdraw(id: string): Promise<void> {
    try {
      const events = this.events();
      const current = await events.get(id);
      if (current && current.state !== "pending") return;
      await events.delete(id);
      const ledger = this.ledger();
      await attempt(
        ATTEMPTS,
        async () => {
          const held = await ledger.get(LEDGER_KEY);
          if (!held?.places[id]) return undefined;
          const places = Object.fromEntries(
            Object.entries(held.places).filter(([key]) => key !== id),
          );
          return (await ledger.compareAndSet(LEDGER_KEY, held, {
            ...held,
            places,
          }))
            ? undefined
            : retry;
        },
        () => undefined,
      );
    } catch {
      // A place not given back is reclaimed by retention; the request was denied either way.
    }
  }

  /**
   * Records the outcome once; later or concurrent settlements keep the first.
   * A turn that reported no usage has an unknown cost, never a zero one.
   */
  async settle(
    id: string,
    outcome: "completed" | "failed",
    settlement: GuestTurnSettlement | undefined,
  ): Promise<boolean> {
    try {
      const events = this.events();
      return await attempt(
        ATTEMPTS,
        async () => {
          const current = await events.get(id);
          if (!current || current.state === "pending") return false;
          if (current.state !== "unresolved") return true;
          return (await events.compareAndSet(id, current, {
            ...current,
            state: outcome,
            settledAt: this.now(),
            ...(settlement ? { usage: settlement.usage } : {}),
            cost: settlement?.cost ?? {
              state: "unknown",
              reason: "missing-usage",
            },
          }))
            ? true
            : retry;
        },
        () => false,
      );
    } catch {
      // An unwritten outcome leaves the request unresolved and its reservation held.
      return false;
    }
  }

  /** The newest records first, at most `limit`. */
  async list(limit: number): Promise<GuestUsageEvent[]> {
    const ledger = await this.ledger().get(LEDGER_KEY);
    if (!ledger) return [];
    const ids = Object.entries(ledger.places)
      .sort(([a, x], [b, y]) => y.openedAt - x.openedAt || a.localeCompare(b))
      .slice(0, limit)
      .map(([id]) => id);
    const events = this.events();
    const found = await Promise.all(ids.map((id) => events.get(id)));
    return found.filter((event): event is GuestUsageEvent => event !== null);
  }
}

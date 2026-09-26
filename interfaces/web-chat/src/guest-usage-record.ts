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
import { guestAdmissionDenialSchema } from "./guest-admission-state";
import type { GuestUsageBounds } from "./guest-policy";

export type { GuestUsageBounds } from "./guest-policy";

const LEDGER_NAMESPACE = "web-chat.guest-usage.ledger";
const EVENTS_NAMESPACE = "web-chat.guest-usage.events";
const DENIAL_LEDGER_NAMESPACE = "web-chat.guest-usage.denial-ledger";
const DENIALS_NAMESPACE = "web-chat.guest-usage.denials";
const COUNTS_NAMESPACE = "web-chat.guest-usage.denial-counts";
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
    z.strictObject({
      openedAt: millis,
      retainUntil: millis,
      /** UTF-8 bytes of question text this record keeps. */
      bytes: z.number().int().nonnegative().optional(),
    }),
  ),
});
type Ledger = z.output<typeof ledgerSchema>;

const storedBytes = (ledger: Ledger | null): number =>
  Object.values(ledger?.places ?? {}).reduce(
    (total, place) => total + (place.bytes ?? 0),
    0,
  );

export interface GuestUsageHealth {
  status: "healthy" | "degraded" | "unhealthy";
  message: string;
  details?: Record<string, number>;
}

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
    question: z.ZodOptional<z.ZodString>;
    questionTruncated: z.ZodOptional<z.ZodLiteral<true>>;
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
  /** Kept only when the visitor was shown the recording notice first. */
  question: z.string().optional(),
  questionTruncated: z.literal(true).optional(),
});
export type GuestUsageEvent = z.output<typeof guestUsageEventSchema>;

/** Why a question was refused: an admission reason, the route's own refusal, or the record's. */
export const guestUsageDenialReasonSchema: z.ZodEnum<
  (typeof guestAdmissionDenialSchema)["enum"] & {
    forbidden: "forbidden";
    method: "method";
    "media-type": "media-type";
    "invalid-request": "invalid-request";
    oversized: "oversized";
    "not-found": "not-found";
    closed: "closed";
    "record-full": "record-full";
    "record-unavailable": "record-unavailable";
  }
> = z.enum([
  ...guestAdmissionDenialSchema.options,
  "forbidden",
  "method",
  "media-type",
  "invalid-request",
  "oversized",
  "not-found",
  "closed",
  "record-full",
  "record-unavailable",
]);
export type GuestUsageDenialReason = z.output<
  typeof guestUsageDenialReasonSchema
>;

const denialLedgerSchema = z.strictObject({
  version: z.literal(1),
  places: z.record(
    z.string().uuid(),
    z.strictObject({ at: millis, retainUntil: millis }),
  ),
});
type DenialLedger = z.output<typeof denialLedgerSchema>;

export const guestUsageDenialSchema: z.ZodObject<
  {
    version: z.ZodLiteral<1>;
    id: z.ZodString;
    at: z.ZodNumber;
    retainUntil: z.ZodNumber;
    reason: typeof guestUsageDenialReasonSchema;
    visitor: z.ZodOptional<z.ZodString>;
  },
  z.core.$strict
> = z.strictObject({
  version: z.literal(1),
  id: z.string().uuid(),
  at: millis,
  retainUntil: millis,
  reason: guestUsageDenialReasonSchema,
  /** Absent when no visitor was identified; never invented. */
  visitor: digestSchema.optional(),
});
export type GuestUsageDenial = z.output<typeof guestUsageDenialSchema>;

/** Daily counts by reason once detailed denials are full: no text, no visitors. */
const denialCountsSchema = z.strictObject({
  version: z.literal(1),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  counts: z.partialRecord(
    guestUsageDenialReasonSchema,
    z.number().int().positive(),
  ),
});
type DenialCounts = z.output<typeof denialCountsSchema>;
export interface GuestUsageDenialDay {
  day: string;
  counts: Partial<Record<GuestUsageDenialReason, number>>;
}
export type GuestUsageOpening = "opened" | "exists" | "full" | "unavailable";

/** The longest prefix within `bytes` of UTF-8, never splitting a character. */
function within(text: string, bytes: number): string {
  const encoder = new TextEncoder();
  const kept = Array.from(text).reduce(
    (prefix, character) =>
      prefix.full || prefix.size + encoder.encode(character).byteLength > bytes
        ? { ...prefix, full: true }
        : {
            text: prefix.text + character,
            size: prefix.size + encoder.encode(character).byteLength,
            full: false,
          },
    { text: "", size: 0, full: false },
  );
  return kept.text;
}

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
    DENIAL_LEDGER_NAMESPACE,
    DENIALS_NAMESPACE,
    COUNTS_NAMESPACE,
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
  /** Counted denials not yet written, by day and reason; flushed on maintenance. */
  /** Set by a write that failed, cleared by one that succeeded; health reads it. */
  private failing = false;
  private readonly pending = new Map<
    string,
    Map<GuestUsageDenialReason, number>
  >();

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

  private denialLedger(): IRuntimeStateStore<DenialLedger> {
    return this.state.scoped({
      namespace: DENIAL_LEDGER_NAMESPACE,
      schema: denialLedgerSchema,
    });
  }

  private denialEvents(): IRuntimeStateStore<GuestUsageDenial> {
    return this.state.scoped({
      namespace: DENIALS_NAMESPACE,
      schema: guestUsageDenialSchema,
    });
  }

  private denialCountRows(): IRuntimeStateStore<DenialCounts> {
    return this.state.scoped({
      namespace: COUNTS_NAMESPACE,
      schema: denialCountsSchema,
    });
  }

  /** The deployment's salt, created with the record's ledger if it has none yet. */
  private async salt(): Promise<string> {
    const ledger = this.ledger();
    const current = await ledger.get(LEDGER_KEY);
    if (current) return current.salt;
    await ledger.setIfNotExists(LEDGER_KEY, {
      version: 1,
      salt: randomBytes(32).toString("hex"),
      places: {},
    });
    const created = await ledger.get(LEDGER_KEY);
    if (!created) throw new Error("Guest usage record unavailable");
    return created.salt;
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
          if (current && this.isFull(current)) return "full";
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
      if (opening === "unavailable") this.failing = true;
      if (opening !== "opened") return opening;
      await this.events().set(id, {
        version: 1,
        id,
        openedAt: now,
        retainUntil,
        state: "pending",
      });
      this.failing = false;
      return "opened";
    } catch {
      // An unwritable record admits nothing; retention reclaims a place whose
      // event was never written.
      this.failing = true;
      return "unavailable";
    }
  }

  /** No place left, or no room for one more question at its largest. */
  private isFull(ledger: Ledger): boolean {
    return (
      Object.keys(ledger.places).length >= this.bounds.maxRecords ||
      storedBytes(ledger) + this.bounds.questionBytes >
        this.bounds.maxStoredBytes
    );
  }

  /** The admission ledger granted the request: it is now unresolved until settled. */
  async admit(
    id: string,
    admitted: {
      visitorId: string;
      reservedMicroUsd: number;
      /** Only when the visitor was shown the recording notice with this question. */
      question?: string;
    },
  ): Promise<boolean> {
    try {
      const ledgers = this.ledger();
      const ledger = await ledgers.get(LEDGER_KEY);
      if (!ledger) return false;
      const question = this.question(admitted.question);
      const bytes = new TextEncoder().encode(
        question.question ?? "",
      ).byteLength;
      // The kept text is counted against storage before it is written.
      const counted = await attempt(
        ATTEMPTS,
        async () => {
          const current = await ledgers.get(LEDGER_KEY);
          const place = current?.places[id];
          if (!current || !place) return false;
          if (place.bytes === bytes) return true;
          return (await ledgers.compareAndSet(LEDGER_KEY, current, {
            ...current,
            places: { ...current.places, [id]: { ...place, bytes } },
          }))
            ? true
            : retry;
        },
        () => false,
      );
      if (!counted) {
        this.failing = true;
        return false;
      }
      const events = this.events();
      const admittedNow = await attempt(
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
            ...question,
          }))
            ? true
            : retry;
        },
        () => false,
      );
      this.failing = !admittedNow;
      return admittedNow;
    } catch {
      // Without an admission record the request must not run; the caller denies.
      this.failing = true;
      return false;
    }
  }

  private question(
    text: string | undefined,
  ): Pick<GuestUsageEvent, "question" | "questionTruncated"> {
    if (text === undefined) return {};
    const kept = within(text, this.bounds.questionBytes);
    return kept === text
      ? { question: kept }
      : { question: kept, questionTruncated: true };
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

  /**
   * Records a refused question: in detail, with the visitor's digest when one
   * was identified, while the denial allowance lasts; afterwards only as a
   * daily count, written on the next flush so a flood writes nothing more.
   * Never throws: an unrecordable denial is counted instead.
   */
  async deny(
    reason: GuestUsageDenialReason,
    visitorId: string | undefined,
  ): Promise<void> {
    try {
      const now = this.now();
      const id = crypto.randomUUID();
      const retainUntil = now + this.bounds.retentionSeconds * 1000;
      const ledger = this.denialLedger();
      const placed = await attempt(
        ATTEMPTS,
        async () => {
          const current = await ledger.get(LEDGER_KEY);
          if (
            current &&
            Object.keys(current.places).length >= this.bounds.maxDenialRecords
          )
            return false;
          const next: DenialLedger = {
            version: 1,
            places: { ...current?.places, [id]: { at: now, retainUntil } },
          };
          const written = current
            ? await ledger.compareAndSet(LEDGER_KEY, current, next)
            : await ledger.setIfNotExists(LEDGER_KEY, next);
          return written ? true : retry;
        },
        () => false,
      );
      if (!placed) return this.count(reason);
      const visitor =
        visitorId === undefined
          ? undefined
          : digest(await this.salt(), visitorId);
      await this.denialEvents().set(id, {
        version: 1,
        id,
        at: now,
        retainUntil,
        reason,
        ...(visitor ? { visitor } : {}),
      });
    } catch {
      // Storage refused the detail; the denial still counts.
      this.count(reason);
    }
  }

  private count(reason: GuestUsageDenialReason): void {
    const day = new Date(this.now()).toISOString().slice(0, 10);
    const reasons = this.pending.get(day) ?? new Map();
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    this.pending.set(day, reasons);
  }

  /** Writes counted denials, one write per day; unwritten counts wait for the next flush. */
  async flush(): Promise<void> {
    const days = [...this.pending.entries()];
    this.pending.clear();
    const rows = this.denialCountRows();
    const failed = await Promise.all(
      days.map(async ([day, reasons]): Promise<boolean> => {
        try {
          const written = await attempt(
            ATTEMPTS,
            async () => {
              const current = await rows.get(day);
              const counts = Object.fromEntries(
                [...reasons].map(([reason, added]) => [
                  reason,
                  (current?.counts[reason] ?? 0) + added,
                ]),
              );
              const next: DenialCounts = {
                version: 1,
                day,
                counts: { ...current?.counts, ...counts },
              };
              return (
                current
                  ? await rows.compareAndSet(day, current, next)
                  : await rows.setIfNotExists(day, next)
              )
                ? true
                : retry;
            },
            () => false,
          );
          if (written) return false;
        } catch {
          // Kept below for the next flush; the caller reports the failure.
        }
        reasons.forEach((added, reason) => {
          const waiting = this.pending.get(day) ?? new Map();
          waiting.set(reason, (waiting.get(reason) ?? 0) + added);
          this.pending.set(day, waiting);
        });
        return true;
      }),
    );
    if (failed.some(Boolean)) throw new Error("Guest usage counts unavailable");
  }

  /** Detailed denials, newest first, at most `limit`. */
  async denials(limit: number): Promise<GuestUsageDenial[]> {
    const ledger = await this.denialLedger().get(LEDGER_KEY);
    if (!ledger) return [];
    const ids = Object.entries(ledger.places)
      .sort(([a, x], [b, y]) => y.at - x.at || a.localeCompare(b))
      .slice(0, limit)
      .map(([id]) => id);
    const events = this.denialEvents();
    const found = await Promise.all(ids.map((id) => events.get(id)));
    return found.filter(
      (denial): denial is GuestUsageDenial => denial !== null,
    );
  }

  /** Written daily denial counts, newest day first. */
  async denialCounts(): Promise<GuestUsageDenialDay[]> {
    const rows = await this.denialCountRows().list({ limit: 1000 });
    return rows
      .map(({ value }) => ({ day: value.day, counts: value.counts }))
      .sort((a, b) => b.day.localeCompare(a.day));
  }

  /**
   * Removes records, denials and daily counts past their own retention. It
   * touches only this record: admission accounting and unresolved
   * reservations are separate state, and nothing here restores credit.
   */
  async cleanup(): Promise<void> {
    const now = this.now();
    try {
      await this.expire(this.ledger(), this.events(), now);
      await this.expire(this.denialLedger(), this.denialEvents(), now);
      const cutoff = new Date(now - this.bounds.retentionSeconds * 1000)
        .toISOString()
        .slice(0, 10);
      const rows = this.denialCountRows();
      const days = await rows.list({ limit: 1000 });
      await Promise.all(
        days
          .filter(({ value }) => value.day < cutoff)
          .map(({ key }) => rows.delete(key)),
      );
    } catch {
      // Reported through health; the next maintenance tick tries again.
      this.failing = true;
      throw new Error("Guest usage cleanup unavailable");
    }
  }

  private async expire<
    L extends { places: Record<string, { retainUntil: number }> },
    E,
  >(
    ledgers: IRuntimeStateStore<L>,
    events: IRuntimeStateStore<E>,
    now: number,
  ): Promise<void> {
    const ledger = await ledgers.get(LEDGER_KEY);
    if (!ledger) return;
    const expired = Object.entries(ledger.places)
      .filter(([, place]) => place.retainUntil <= now)
      .map(([id]) => id);
    if (expired.length === 0) return;
    await Promise.all(expired.map((id) => events.delete(id)));
    await attempt(
      ATTEMPTS,
      async () => {
        const current = await ledgers.get(LEDGER_KEY);
        if (!current) return undefined;
        const places = Object.fromEntries(
          Object.entries(current.places).filter(
            ([id]) => !expired.includes(id),
          ),
        );
        return (await ledgers.compareAndSet(LEDGER_KEY, current, {
          ...current,
          places,
        }))
          ? undefined
          : retry;
      },
      () => {
        throw new Error("Guest usage cleanup contended");
      },
    );
  }

  /** Bounded, sanitized health: counts only, never text or storage errors. */
  async health(): Promise<GuestUsageHealth> {
    try {
      const ledger = await this.ledger().get(LEDGER_KEY);
      const denials = await this.denialLedger().get(LEDGER_KEY);
      const uncounted = [...this.pending.values()].reduce(
        (total, reasons) =>
          total + [...reasons.values()].reduce((sum, n) => sum + n, 0),
        0,
      );
      const details = {
        records: Object.keys(ledger?.places ?? {}).length,
        maxRecords: this.bounds.maxRecords,
        storedBytes: storedBytes(ledger),
        maxStoredBytes: this.bounds.maxStoredBytes,
        denials: Object.keys(denials?.places ?? {}).length,
        maxDenialRecords: this.bounds.maxDenialRecords,
        uncountedDenials: uncounted,
      };
      if (this.failing)
        return {
          status: "unhealthy",
          message:
            "Guest usage record writes are failing; new guest questions are refused.",
          details,
        };
      if (ledger && this.isFull(ledger))
        return {
          status: "degraded",
          message:
            "Guest usage record is full; new guest questions are refused until retention frees room.",
          details,
        };
      return {
        status: "healthy",
        message: "Guest usage record is recording.",
        details,
      };
    } catch {
      // Storage errors can carry recorded values; report the outage only.
      return {
        status: "unhealthy",
        message: "Guest usage record unavailable.",
      };
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

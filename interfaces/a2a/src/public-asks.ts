import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";

/**
 * Being asked is bounded. A public A2A caller (any brain, signed or not) gets
 * a daily allowance of questions and of answer tokens, per caller and for the
 * brain as a whole, with a switch to stop answering at all. Tokens, not money:
 * every answer reports its tokens, while the price of an arbitrary provider's
 * model is not known here.
 */

type PublicAsksConfigSchema = z.ZodObject<{
  enabled: z.ZodDefault<z.ZodBoolean>;
  perCallerPerDay: z.ZodDefault<z.ZodNumber>;
  perDay: z.ZodDefault<z.ZodNumber>;
  tokensPerCallerPerDay: z.ZodDefault<z.ZodNumber>;
  tokensPerDay: z.ZodDefault<z.ZodNumber>;
}>;

export const publicAsksConfigSchema: PublicAsksConfigSchema = z.object({
  /** The kill switch: off refuses every public question with a message. */
  enabled: z.boolean().default(true),
  /** Questions one caller may ask per UTC day. */
  perCallerPerDay: z.number().int().positive().default(60),
  /** Questions all public callers together may ask per UTC day. */
  perDay: z.number().int().positive().default(600),
  /** Answer tokens one caller may use per UTC day. */
  tokensPerCallerPerDay: z.number().int().positive().default(300_000),
  /** Answer tokens all public callers together may use per UTC day. */
  tokensPerDay: z.number().int().positive().default(3_000_000),
});

export type PublicAsksConfig = z.output<typeof publicAsksConfigSchema>;

export type PublicAskAdmission = { ok: true } | { ok: false; reason: string };

/** What the handler needs: a yes or a reason before the turn, the tokens after. */
export interface PublicAskAllowance {
  admit(caller: string | null): Promise<PublicAskAdmission>;
  settle(caller: string | null, tokens: number): Promise<void>;
}

const tallySchema = z.object({
  messages: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative(),
});

const dayStateSchema = z.object({
  revision: z.number().int().nonnegative(),
  total: tallySchema,
  callers: z.record(z.string(), tallySchema),
});

type Tally = z.output<typeof tallySchema>;
type DayState = z.output<typeof dayStateSchema>;

const EMPTY_TALLY: Tally = { messages: 0, tokens: 0 };
const EMPTY_DAY: DayState = { revision: 0, total: EMPTY_TALLY, callers: {} };
/** Concurrent public callers race on one day's record; a lost write is retried. */
const MAX_WRITE_ATTEMPTS = 16;
/** Unsigned callers cannot be told apart, so they share one allowance. */
const ANONYMOUS = "anonymous";

export const PUBLIC_ASKS_OFF_REASON =
  "This brain is not answering public questions over A2A at the moment.";

function dayOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function callerKey(caller: string | null): string {
  return caller ?? ANONYMOUS;
}

function refusal(
  config: PublicAsksConfig,
  callerName: string,
  total: Tally,
  own: Tally,
): string | undefined {
  if (!config.enabled) return PUBLIC_ASKS_OFF_REASON;
  if (total.messages >= config.perDay)
    return "This brain has reached today's allowance of public questions; ask again tomorrow.";
  if (total.tokens >= config.tokensPerDay)
    return "This brain has used today's allowance of answer tokens for public questions; ask again tomorrow.";
  if (own.messages >= config.perCallerPerDay)
    return `${callerName} has reached today's allowance of ${config.perCallerPerDay} public questions on this brain.`;
  if (own.tokens >= config.tokensPerCallerPerDay)
    return `${callerName} has used today's allowance of answer tokens on this brain.`;
  return undefined;
}

function add(tally: Tally, messages: number, tokens: number): Tally {
  return { messages: tally.messages + messages, tokens: tally.tokens + tokens };
}

/** The allowance kept in runtime state, one record per UTC day. */
export class RuntimePublicAskAllowance implements PublicAskAllowance {
  private readonly config: PublicAsksConfig;
  private readonly store: IRuntimeStateStore<DayState>;
  private readonly now: () => number;

  constructor(
    config: PublicAsksConfig,
    runtimeState: IRuntimeStateNamespace,
    options: { now?: () => number } = {},
  ) {
    this.config = config;
    this.store = runtimeState.scoped({
      namespace: "a2a.public-asks",
      schema: dayStateSchema,
    });
    this.now = options.now ?? Date.now;
  }

  async admit(caller: string | null): Promise<PublicAskAdmission> {
    if (!this.config.enabled)
      return { ok: false, reason: PUBLIC_ASKS_OFF_REASON };
    const key = callerKey(caller);
    const outcome = await this.update(key, (state, own) => {
      const reason = refusal(this.config, key, state.total, own);
      return reason === undefined
        ? { next: add(own, 1, 0), reason: undefined }
        : { next: undefined, reason };
    });
    return outcome === undefined
      ? { ok: true }
      : { ok: false, reason: outcome };
  }

  async settle(caller: string | null, tokens: number): Promise<void> {
    const counted = Math.max(0, Math.floor(tokens));
    if (counted === 0) return;
    await this.update(callerKey(caller), (_state, own) => ({
      next: add(own, 0, counted),
      reason: undefined,
    }));
  }

  /**
   * Apply one caller's change to today's record under compare-and-set. The
   * decision's `reason` is returned unchanged; `undefined` means the change
   * was written.
   */
  private async update(
    key: string,
    decide: (
      state: DayState,
      own: Tally,
    ) => { next: Tally | undefined; reason: string | undefined },
    attempt = 1,
  ): Promise<string | undefined> {
    const day = dayOf(this.now());
    const current = (await this.store.get(day)) ?? EMPTY_DAY;
    const own = current.callers[key] ?? EMPTY_TALLY;
    const decision = decide(current, own);
    if (decision.next === undefined) return decision.reason;
    const next: DayState = {
      revision: current.revision + 1,
      total: add(
        current.total,
        decision.next.messages - own.messages,
        decision.next.tokens - own.tokens,
      ),
      callers: { ...current.callers, [key]: decision.next },
    };
    const written =
      current.revision === 0 && !(await this.store.has(day))
        ? await this.store.setIfNotExists(day, next)
        : await this.store.compareAndSet(day, current, next);
    if (written) return undefined;
    if (attempt >= MAX_WRITE_ATTEMPTS)
      throw new Error("Public ask allowance could not be recorded");
    return this.update(key, decide, attempt + 1);
  }
}

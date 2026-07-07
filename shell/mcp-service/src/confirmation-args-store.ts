function stableForConfirmation(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableForConfirmation);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, stableForConfirmation(entryValue)]),
  );
}

export type ConfirmationArgsValidationResult =
  { status: "ok" } | { status: "missing" } | { status: "mismatch" };

const DEFAULT_CONFIRMATION_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_PENDING = 1000;

export interface ConfirmationArgsStoreOptions {
  ttlMs?: number;
  maxPending?: number;
  now?: () => number;
}

export class ConfirmationArgsStore {
  private readonly pendingArgs = new Map<
    string,
    { serialized: string; createdAt: number }
  >();
  private readonly ttlMs: number;
  private readonly maxPending: number;
  private readonly getNow: () => number;

  constructor(options: ConfirmationArgsStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_CONFIRMATION_TTL_MS;
    this.maxPending = options.maxPending ?? DEFAULT_MAX_PENDING;
    this.getNow = options.now ?? Date.now;
  }

  create<TArgs>(buildArgs: (confirmationToken: string) => TArgs): TArgs {
    this.prune();
    // Map preserves insertion order, so the first keys are the oldest.
    // `>=` leaves room for the entry added below.
    while (this.pendingArgs.size >= this.maxPending) {
      const oldest = this.pendingArgs.keys().next().value;
      if (oldest === undefined) break;
      this.pendingArgs.delete(oldest);
    }
    const confirmationToken = crypto.randomUUID();
    const args = buildArgs(confirmationToken);
    this.pendingArgs.set(confirmationToken, {
      serialized: this.serialize(args),
      createdAt: this.getNow(),
    });
    return args;
  }

  validate(
    confirmationToken: string | undefined,
    args: unknown,
  ): ConfirmationArgsValidationResult {
    this.prune();
    const entry = confirmationToken
      ? this.pendingArgs.get(confirmationToken)
      : undefined;
    if (!confirmationToken || !entry) {
      return { status: "missing" };
    }
    this.pendingArgs.delete(confirmationToken);
    if (this.serialize(args) !== entry.serialized) {
      return { status: "mismatch" };
    }
    return { status: "ok" };
  }

  /**
   * Evict expired entries. Runs lazily on every create/validate so
   * never-resolved confirmations can't accumulate.
   */
  private prune(): void {
    const cutoff = this.getNow() - this.ttlMs;
    for (const [token, entry] of this.pendingArgs) {
      if (entry.createdAt < cutoff) {
        this.pendingArgs.delete(token);
      }
    }
  }

  private serialize(value: unknown): string {
    return JSON.stringify(stableForConfirmation(value));
  }
}

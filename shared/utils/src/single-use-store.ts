import { createHash, randomBytes } from "node:crypto";

export interface SingleUseStoreOptions {
  /** How long an issued token stays valid. */
  ttlMs: number;
  /** Values held at once; issuing beyond it drops the oldest. */
  maxPending: number;
  now?: (() => number) | undefined;
}

interface Pending<T> {
  value: T;
  expiresAt: number;
}

function keyOf(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

/**
 * Process-local values behind random, expiring, single-use tokens, such as
 * OAuth state or one-time grants. Only token hashes are kept as keys. A
 * restart drops every pending value; its holder starts over.
 */
export class SingleUseStore<T> {
  private readonly pending = new Map<string, Pending<T>>();
  private readonly ttlMs: number;
  private readonly maxPending: number;
  private readonly now: () => number;

  constructor(options: SingleUseStoreOptions) {
    if (!Number.isSafeInteger(options.ttlMs) || options.ttlMs <= 0) {
      throw new Error("Single-use store TTL must be a positive integer");
    }
    if (!Number.isSafeInteger(options.maxPending) || options.maxPending <= 0) {
      throw new Error("Single-use store bound must be a positive integer");
    }
    this.ttlMs = options.ttlMs;
    this.maxPending = options.maxPending;
    this.now = options.now ?? Date.now;
  }

  issue(value: T): string {
    this.prune();
    [...this.pending.keys()]
      .slice(0, Math.max(0, this.pending.size - this.maxPending + 1))
      .forEach((oldest) => this.pending.delete(oldest));
    const token = randomBytes(32).toString("base64url");
    this.pending.set(keyOf(token), {
      value,
      expiresAt: this.now() + this.ttlMs,
    });
    return token;
  }

  /**
   * The token's value, removed so it cannot be taken again. A value `accept`
   * refuses stays, so a mismatched caller cannot burn someone else's token.
   */
  take(token: string, accept: (value: T) => boolean = () => true): T | null {
    this.prune();
    const key = keyOf(token);
    const pending = this.pending.get(key);
    if (!pending || !accept(pending.value)) return null;
    this.pending.delete(key);
    return pending.value;
  }

  private prune(): void {
    const now = this.now();
    [...this.pending]
      .filter(([, pending]) => pending.expiresAt <= now)
      .forEach(([key]) => this.pending.delete(key));
  }
}

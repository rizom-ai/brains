import { randomBytes } from "node:crypto";

const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_PENDING_STATES = 20;

export interface PendingLinkedInOAuthState {
  redirectUri: string;
  expiresAt: number;
}

export interface LinkedInOAuthStateStoreOptions {
  ttlMs?: number | undefined;
  maxPendingStates?: number | undefined;
  now?: (() => number) | undefined;
  generateState?: (() => string) | undefined;
}

/** Short-lived, process-local CSRF state for LinkedIn's browser OAuth flow. */
export class LinkedInOAuthStateStore {
  private readonly pending = new Map<string, PendingLinkedInOAuthState>();
  private readonly ttlMs: number;
  private readonly maxPendingStates: number;
  private readonly now: () => number;
  private readonly generateState: () => string;

  constructor(options: LinkedInOAuthStateStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_STATE_TTL_MS;
    this.maxPendingStates =
      options.maxPendingStates ?? DEFAULT_MAX_PENDING_STATES;
    this.now = options.now ?? Date.now;
    this.generateState =
      options.generateState ??
      ((): string => randomBytes(32).toString("base64url"));

    if (!Number.isSafeInteger(this.ttlMs) || this.ttlMs <= 0) {
      throw new Error("LinkedIn OAuth state TTL must be a positive integer");
    }
    if (
      !Number.isSafeInteger(this.maxPendingStates) ||
      this.maxPendingStates <= 0
    ) {
      throw new Error(
        "LinkedIn OAuth maximum pending states must be a positive integer",
      );
    }
  }

  issue(redirectUri: string): string {
    this.pruneExpired();
    while (this.pending.size >= this.maxPendingStates) {
      const oldest = this.pending.keys().next().value;
      if (typeof oldest !== "string") break;
      this.pending.delete(oldest);
    }

    const state = this.generateState().trim();
    if (!state) throw new Error("Generated LinkedIn OAuth state is empty");
    if (this.pending.has(state)) {
      throw new Error("Generated duplicate LinkedIn OAuth state");
    }

    this.pending.set(state, {
      redirectUri,
      expiresAt: this.now() + this.ttlMs,
    });
    return state;
  }

  consume(state: string): PendingLinkedInOAuthState | undefined {
    this.pruneExpired();
    const normalized = state.trim();
    if (!normalized) return undefined;

    const pending = this.pending.get(normalized);
    if (!pending) return undefined;
    this.pending.delete(normalized);
    return pending;
  }

  private pruneExpired(): void {
    const now = this.now();
    for (const [state, pending] of this.pending) {
      if (pending.expiresAt <= now) this.pending.delete(state);
    }
  }
}

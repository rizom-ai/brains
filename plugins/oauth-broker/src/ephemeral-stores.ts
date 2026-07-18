import { createHash, randomBytes } from "node:crypto";
import type { OAuthBrokerCredential } from "./contracts";

const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_GRANT_TTL_MS = 2 * 60 * 1000;
const DEFAULT_MAX_PENDING = 1_000;

export interface OAuthBrokerPendingAuthorization {
  providerId: string;
  instanceId: string;
  returnUri: string;
  brainState: string;
  expiresAt: number;
}

export interface OAuthBrokerPendingGrant {
  providerId: string;
  instanceId: string;
  credential: OAuthBrokerCredential;
  expiresAt: number;
}

export interface OAuthBrokerEphemeralStoreOptions {
  ttlMs?: number | undefined;
  maxPending?: number | undefined;
  now?: (() => number) | undefined;
  generateSecret?: (() => string) | undefined;
}

function validateOptions(ttlMs: number, maxPending: number): void {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new Error("OAuth broker TTL must be a positive integer");
  }
  if (!Number.isSafeInteger(maxPending) || maxPending <= 0) {
    throw new Error("OAuth broker pending limit must be a positive integer");
  }
}

function secretHash(secret: string): string {
  return createHash("sha256").update(secret).digest("base64url");
}

function defaultSecret(): string {
  return randomBytes(32).toString("base64url");
}

abstract class BoundedEphemeralStore<T extends { expiresAt: number }> {
  protected readonly pending: Map<string, T> = new Map<string, T>();
  protected readonly ttlMs: number;
  protected readonly now: () => number;
  private readonly maxPending: number;
  private readonly generateSecret: () => string;

  constructor(options: OAuthBrokerEphemeralStoreOptions, defaultTtlMs: number) {
    this.ttlMs = options.ttlMs ?? defaultTtlMs;
    this.maxPending = options.maxPending ?? DEFAULT_MAX_PENDING;
    this.now = options.now ?? Date.now;
    this.generateSecret = options.generateSecret ?? defaultSecret;
    validateOptions(this.ttlMs, this.maxPending);
  }

  protected issueRecord(create: (expiresAt: number) => T): string {
    this.pruneExpired();
    while (this.pending.size >= this.maxPending) {
      const oldest = this.pending.keys().next().value;
      if (typeof oldest !== "string") break;
      this.pending.delete(oldest);
    }

    const secret = this.generateSecret().trim();
    if (secret.length < 32) {
      throw new Error("Generated OAuth broker secret is too short");
    }
    const key = secretHash(secret);
    if (this.pending.has(key)) {
      throw new Error("Generated duplicate OAuth broker secret");
    }
    this.pending.set(key, create(this.now() + this.ttlMs));
    return secret;
  }

  protected getRecord(secret: string): T | undefined {
    this.pruneExpired();
    return this.pending.get(secretHash(secret));
  }

  protected deleteRecord(secret: string): void {
    this.pending.delete(secretHash(secret));
  }

  private pruneExpired(): void {
    const now = this.now();
    for (const [key, record] of this.pending) {
      if (record.expiresAt <= now) this.pending.delete(key);
    }
  }
}

export class OAuthBrokerAuthorizationStateStore extends BoundedEphemeralStore<OAuthBrokerPendingAuthorization> {
  constructor(options: OAuthBrokerEphemeralStoreOptions = {}) {
    super(options, DEFAULT_STATE_TTL_MS);
  }

  issue(input: {
    providerId: string;
    instanceId: string;
    returnUri: string;
    brainState: string;
  }): string {
    return this.issueRecord((expiresAt) => ({ ...input, expiresAt }));
  }

  consume(
    state: string,
    providerId: string,
  ): OAuthBrokerPendingAuthorization | undefined {
    const record = this.getRecord(state);
    if (record?.providerId !== providerId) return undefined;
    this.deleteRecord(state);
    return record;
  }
}

export class OAuthBrokerGrantStore extends BoundedEphemeralStore<OAuthBrokerPendingGrant> {
  constructor(options: OAuthBrokerEphemeralStoreOptions = {}) {
    super(options, DEFAULT_GRANT_TTL_MS);
  }

  issue(input: {
    providerId: string;
    instanceId: string;
    credential: OAuthBrokerCredential;
  }): string {
    return this.issueRecord((expiresAt) => ({ ...input, expiresAt }));
  }

  redeem(
    grant: string,
    providerId: string,
    instanceId: string,
  ): OAuthBrokerCredential | undefined {
    const record = this.getRecord(grant);
    if (record?.providerId !== providerId || record.instanceId !== instanceId) {
      return undefined;
    }
    this.deleteRecord(grant);
    return record.credential;
  }
}

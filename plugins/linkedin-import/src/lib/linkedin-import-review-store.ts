import { createHash, randomBytes } from "node:crypto";

const DEFAULT_REVIEW_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_PENDING_REVIEWS = 20;

interface PendingLinkedInImportReview {
  sessionHash: string;
  previewDigest: string;
  expiresAt: number;
}

export interface LinkedInImportReviewStoreOptions {
  ttlMs?: number | undefined;
  maxPendingReviews?: number | undefined;
  now?: (() => number) | undefined;
  generateReviewId?: (() => string) | undefined;
}

export interface IssuedLinkedInImportReview {
  reviewId: string;
  expiresAt: number;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

/** Bounded, process-local approval records for deterministic profile imports. */
export class LinkedInImportReviewStore {
  private readonly pending: Map<string, PendingLinkedInImportReview> = new Map<
    string,
    PendingLinkedInImportReview
  >();
  private readonly ttlMs: number;
  private readonly maxPendingReviews: number;
  private readonly now: () => number;
  private readonly generateReviewId: () => string;

  constructor(options: LinkedInImportReviewStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_REVIEW_TTL_MS;
    this.maxPendingReviews =
      options.maxPendingReviews ?? DEFAULT_MAX_PENDING_REVIEWS;
    this.now = options.now ?? Date.now;
    this.generateReviewId =
      options.generateReviewId ??
      ((): string => randomBytes(32).toString("base64url"));

    if (!Number.isSafeInteger(this.ttlMs) || this.ttlMs <= 0) {
      throw new Error("LinkedIn import review TTL must be a positive integer");
    }
    if (
      !Number.isSafeInteger(this.maxPendingReviews) ||
      this.maxPendingReviews <= 0
    ) {
      throw new Error(
        "LinkedIn import maximum pending reviews must be a positive integer",
      );
    }
  }

  issue(sessionId: string, previewDigest: string): IssuedLinkedInImportReview {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      throw new Error("LinkedIn import review session id must not be empty");
    }
    if (!/^[a-f0-9]{64}$/.test(previewDigest)) {
      throw new Error("LinkedIn import preview digest has an invalid format");
    }
    this.pruneExpired();
    while (this.pending.size >= this.maxPendingReviews) {
      const oldest = this.pending.keys().next().value;
      if (typeof oldest !== "string") break;
      this.pending.delete(oldest);
    }

    const reviewId = this.generateReviewId().trim();
    if (reviewId.length < 32) {
      throw new Error("Generated LinkedIn import review id is too short");
    }
    const key = hash(reviewId);
    if (this.pending.has(key)) {
      throw new Error("Generated duplicate LinkedIn import review id");
    }
    const expiresAt = this.now() + this.ttlMs;
    this.pending.set(key, {
      sessionHash: hash(normalizedSessionId),
      previewDigest,
      expiresAt,
    });
    return { reviewId, expiresAt };
  }

  consume(reviewId: string, sessionId: string): string | undefined {
    this.pruneExpired();
    const normalizedReviewId = reviewId.trim();
    const normalizedSessionId = sessionId.trim();
    if (!normalizedReviewId || !normalizedSessionId) return undefined;
    const key = hash(normalizedReviewId);
    const review = this.pending.get(key);
    if (review?.sessionHash !== hash(normalizedSessionId)) return undefined;
    this.pending.delete(key);
    return review.previewDigest;
  }

  private pruneExpired(): void {
    const now = this.now();
    for (const [reviewId, review] of this.pending) {
      if (review.expiresAt <= now) this.pending.delete(reviewId);
    }
  }
}

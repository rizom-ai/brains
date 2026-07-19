import { describe, expect, it } from "bun:test";
import { LinkedInImportReviewStore } from "../src/lib/linkedin-import-review-store";

const reviewId = "review-0000000000000000000000000000000000";
const previewDigest = "a".repeat(64);

describe("LinkedInImportReviewStore", () => {
  it("binds a review to one session and consumes it once", () => {
    const store = new LinkedInImportReviewStore({
      generateReviewId: (): string => reviewId,
    });
    store.issue("session-one", previewDigest);

    expect(store.consume(reviewId, "session-two")).toBeUndefined();
    expect(store.consume(reviewId, "session-one")).toBe(previewDigest);
    expect(store.consume(reviewId, "session-one")).toBeUndefined();
  });

  it("expires a review", () => {
    let now = 1_700_000_000_000;
    const store = new LinkedInImportReviewStore({
      ttlMs: 1_000,
      now: (): number => now,
      generateReviewId: (): string => reviewId,
    });
    store.issue("session-one", previewDigest);
    now += 1_000;

    expect(store.consume(reviewId, "session-one")).toBeUndefined();
  });

  it("evicts the oldest review when the bounded store is full", () => {
    const reviewIds = [
      "review-a-00000000000000000000000000000000",
      "review-b-00000000000000000000000000000000",
    ];
    let index = 0;
    const store = new LinkedInImportReviewStore({
      maxPendingReviews: 1,
      generateReviewId: (): string => reviewIds[index++] ?? reviewId,
    });
    store.issue("session-one", previewDigest);
    store.issue("session-one", "b".repeat(64));

    expect(store.consume(reviewIds[0] ?? "", "session-one")).toBeUndefined();
    expect(store.consume(reviewIds[1] ?? "", "session-one")).toBe(
      "b".repeat(64),
    );
  });
});

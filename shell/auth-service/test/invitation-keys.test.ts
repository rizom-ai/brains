import { describe, expect, it } from "bun:test";
import { invitationIdempotencyKeyHash } from "../src/invitation-keys";

describe("invitationIdempotencyKeyHash", () => {
  it("gives the same key the same hash, so a retry replays", () => {
    expect(invitationIdempotencyKeyHash("invite-request-1")).toBe(
      invitationIdempotencyKeyHash("invite-request-1"),
    );
  });

  it("ignores padding, so a whitespace difference is still the same request", () => {
    expect(invitationIdempotencyKeyHash("  invite-request-1\n")).toBe(
      invitationIdempotencyKeyHash("invite-request-1"),
    );
  });

  it("gives different keys different hashes", () => {
    expect(invitationIdempotencyKeyHash("invite-request-1")).not.toBe(
      invitationIdempotencyKeyHash("invite-request-2"),
    );
  });

  it("does not store the key itself", () => {
    // The hash is what reaches the database; the caller's key may identify a
    // person or a request and has no business being persisted.
    expect(invitationIdempotencyKeyHash("person@example.test")).not.toContain(
      "person",
    );
  });

  it("refuses an empty key rather than hashing nothing", () => {
    for (const empty of ["", "   ", "\n\t"]) {
      let thrown: unknown;
      try {
        invitationIdempotencyKeyHash(empty);
      } catch (cause) {
        thrown = cause;
      }
      if (!(thrown instanceof Error)) throw new Error("expected an Error");
      expect(thrown.message).toBe("Invitation idempotency key is required");
    }
  });
});

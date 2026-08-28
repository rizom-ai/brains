import { describe, expect, it } from "bun:test";
import {
  EXPIRING_INVITATION_WINDOW_MS,
  deriveInvitationsOverview,
} from "../src/invitations-overview";

describe("Admin invitations Overview contribution", () => {
  it("flags only live setup links inside the expiry window and delivery failures", () => {
    const now = 1_700_000_000_000;
    const result = deriveInvitationsOverview(
      [
        {
          displayName: "Soon",
          invitation: {
            id: "inv-soon",
            userId: "user-soon",
            state: "pending",
            createdAt: now - 1_000,
            updatedAt: now - 1_000,
            expiresAt: now + 60_000,
          },
        },
        {
          displayName: "Later",
          invitation: {
            id: "inv-later",
            userId: "user-later",
            state: "sent",
            createdAt: now - 1_000,
            updatedAt: now - 1_000,
            expiresAt: now + EXPIRING_INVITATION_WINDOW_MS + 1,
          },
        },
        {
          displayName: "Delivery failed",
          invitation: {
            id: "inv-failed",
            userId: "user-failed",
            state: "failed",
            createdAt: now - 1_000,
            updatedAt: now - 1_000,
          },
        },
        {
          displayName: "Already claimed",
          invitation: {
            id: "inv-claimed",
            userId: "user-claimed",
            state: "claimed",
            createdAt: now - 1_000,
            updatedAt: now - 1_000,
            expiresAt: now + 60_000,
          },
        },
      ],
      now,
    );

    expect(result).toEqual({
      invitations: [
        expect.objectContaining({
          id: "inv-soon",
          reason: "expiring",
        }),
        expect.objectContaining({
          id: "inv-failed",
          reason: "delivery-failed",
        }),
      ],
      expiringCount: 1,
      failureCount: 1,
    });
  });
});

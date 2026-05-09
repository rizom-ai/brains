import { describe, expect, it } from "bun:test";
import type { Conversation, Message } from "@brains/plugins";
import {
  evaluateSummaryEligibility,
  getConversationSpaceId,
  isSpaceSelectorMatch,
} from "../../src/lib/summary-space-eligibility";

const conversation: Conversation = {
  id: "conv-1",
  sessionId: "conv-1",
  interfaceType: "discord",
  channelId: "project-alpha",
  channelName: "project-alpha",
  startedAt: "2026-01-01T00:00:00.000Z",
  lastActiveAt: "2026-01-01T00:01:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:01:00.000Z",
  metadata: {},
};

function message(role: Message["role"]): Message {
  return {
    id: `m-${role}`,
    conversationId: "conv-1",
    role,
    content: `${role} message`,
    timestamp: "2026-01-01T00:00:00.000Z",
    metadata: {},
  };
}

describe("summary space eligibility", () => {
  it("builds canonical space ids from conversation metadata", () => {
    expect(getConversationSpaceId(conversation)).toBe("discord:project-alpha");
  });

  it("matches exact space selectors", () => {
    expect(
      isSpaceSelectorMatch("discord:project-alpha", "discord:project-alpha"),
    ).toBe(true);
    expect(
      isSpaceSelectorMatch("discord:project-beta", "discord:project-alpha"),
    ).toBe(false);
  });

  it("matches wildcard space selectors", () => {
    expect(
      isSpaceSelectorMatch("discord:project-*", "discord:project-alpha"),
    ).toBe(true);
    expect(isSpaceSelectorMatch("mcp:*", "discord:project-alpha")).toBe(false);
  });

  it("is ineligible when no spaces are configured", () => {
    expect(evaluateSummaryEligibility({ conversation, spaces: [] })).toEqual({
      eligible: false,
      reason: "no-spaces-configured",
      spaceId: "discord:project-alpha",
    });
  });

  it("is ineligible outside configured spaces", () => {
    expect(
      evaluateSummaryEligibility({ conversation, spaces: ["discord:general"] }),
    ).toMatchObject({
      eligible: false,
      reason: "space-not-configured",
    });
  });

  it("is ineligible for system-only conversations", () => {
    expect(
      evaluateSummaryEligibility({
        conversation,
        spaces: ["discord:project-*"],
        messages: [message("system")],
      }),
    ).toMatchObject({
      eligible: false,
      reason: "system-only",
    });
  });

  it("is eligible in configured spaces with non-system messages", () => {
    expect(
      evaluateSummaryEligibility({
        conversation,
        spaces: ["discord:project-*"],
        messages: [message("system"), message("user")],
      }),
    ).toEqual({
      eligible: true,
      reason: "configured-space",
      spaceId: "discord:project-alpha",
    });
  });
});

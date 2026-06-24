import { describe, expect, it } from "bun:test";
import {
  buildAgentResponseTextParts,
  buildConfirmationResponseParts,
  formatPendingConfirmationHelp,
  formatPendingConfirmationsFallback,
  getDeniedAttachmentCards,
  getDeliverableArtifactCards,
  getResponseJobIds,
  getSupplementalCards,
} from "../../src/message-interface/response-render-plan";
import type { StructuredChatCard } from "../../src/contracts/agent";

const deniedAttachmentCard: StructuredChatCard = {
  kind: "attachment",
  id: "card-1",
  title: "Report",
  attachment: {
    filename: "report.pdf",
    mediaType: "application/pdf",
    url: "/api/files/report.pdf",
  },
};

const visibleAttachmentCard: StructuredChatCard = {
  kind: "attachment",
  id: "card-2",
  title: "Public report",
  attachment: {
    filename: "public.pdf",
    mediaType: "application/pdf",
    url: "/api/files/public.pdf",
  },
};

const approvalCard: StructuredChatCard = {
  kind: "tool-approval",
  id: "approval:call-1",
  toolName: "system_publish",
  summary: "Publish report",
  state: "approval-requested",
};

function formatCard(card: StructuredChatCard): string {
  return `${card.kind}:${card.id}`;
}

describe("buildAgentResponseTextParts", () => {
  it("keeps response text and denied attachment summaries", () => {
    expect(
      buildAgentResponseTextParts({
        text: "Done",
        cards: [deniedAttachmentCard, visibleAttachmentCard],
        pendingConfirmations: undefined,
        deniedCardIds: new Set(["card-1"]),
        formatCard,
      }),
    ).toEqual(["Done", "attachment:card-1"]);
  });

  it("suppresses approval cards when pending confirmations exist", () => {
    expect(
      buildAgentResponseTextParts({
        text: "Need approval",
        cards: [approvalCard],
        pendingConfirmations: [
          {
            id: "approval:call-1",
            toolName: "system_publish",
            summary: "Publish report",
            args: {},
          },
        ],
        deniedCardIds: undefined,
        formatCard,
      }),
    ).toEqual(["Need approval"]);
  });

  it("drops empty parts", () => {
    expect(
      buildAgentResponseTextParts({
        text: " ",
        cards: [],
        pendingConfirmations: undefined,
        deniedCardIds: undefined,
        formatCard,
      }),
    ).toEqual([]);
  });
});

describe("buildConfirmationResponseParts", () => {
  it("includes confirmation label, denied attachment summaries, and remaining help", () => {
    expect(
      buildConfirmationResponseParts({
        response: {
          text: "Published",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          cards: [deniedAttachmentCard, visibleAttachmentCard],
        },
        confirmed: true,
        remainingApprovalHelp:
          "Remaining pending approval ids: `approval:call-2`.",
        deniedCardIds: new Set(["card-1"]),
        formatCard,
        formatPendingConfirmationHelp: (): string | undefined => undefined,
      }),
    ).toEqual({
      variant: "success",
      parts: [
        "Approved · Published",
        "attachment:card-1",
        "Remaining pending approval ids: `approval:call-2`.",
      ],
    });
  });

  it("includes multi-pending confirmation help", () => {
    expect(
      buildConfirmationResponseParts({
        response: {
          text: "Need more approvals",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          pendingConfirmations: [
            {
              id: "approval:call-1",
              toolName: "system_publish",
              summary: "Publish one",
              args: {},
            },
            {
              id: "approval:call-2",
              toolName: "system_publish",
              summary: "Publish two",
              args: {},
            },
          ],
        },
        confirmed: false,
        remainingApprovalHelp: undefined,
        deniedCardIds: undefined,
        formatCard,
        formatPendingConfirmationHelp: (): string | undefined =>
          "Approvals pending help",
      }),
    ).toEqual({
      variant: "declined",
      parts: ["Declined", "Approvals pending help"],
    });
  });
});

describe("pending confirmation fallback text", () => {
  it("formats single pending confirmation help", () => {
    expect(
      formatPendingConfirmationHelp([
        {
          id: "approval:call-1",
          toolName: "system_publish",
          summary: "Publish report",
          args: {},
        },
      ]),
    ).toBe(
      "Approval required: Publish report\nReply yes to confirm or no/cancel to abort.",
    );
  });

  it("formats multiple pending confirmations with ids", () => {
    expect(
      formatPendingConfirmationsFallback([
        {
          id: "approval:call-1",
          toolName: "system_publish",
          summary: "Publish one",
          args: {},
        },
        {
          id: "approval:call-2",
          toolName: "system_publish",
          summary: "Publish two",
          args: {},
        },
      ]),
    ).toBe(
      [
        "Approvals pending:",
        "approval:call-1: Publish one",
        "approval:call-2: Publish two",
        "Reply yes <approval-id> to confirm one item, or no <approval-id> to abort it.",
      ].join("\n"),
    );
  });
});

describe("card bucketing helpers", () => {
  it("returns deliverable artifact cards excluding denied ids", () => {
    expect(
      getDeliverableArtifactCards(
        [deniedAttachmentCard, visibleAttachmentCard, approvalCard],
        new Set(["card-1"]),
      ),
    ).toEqual([visibleAttachmentCard]);
  });

  it("returns supplemental cards excluding attachment and requested approval cards", () => {
    expect(
      getSupplementalCards(
        [deniedAttachmentCard, approvalCard],
        [
          {
            id: "approval:call-1",
            toolName: "system_publish",
            summary: "Publish report",
            args: {},
          },
        ],
      ),
    ).toEqual([]);
  });

  it("collects response job ids from tool results and attachment cards", () => {
    expect(
      getResponseJobIds({
        toolResults: [{ toolName: "system_create", jobId: "job-1" }],
        cards: [
          { ...visibleAttachmentCard, jobId: "job-2" },
          { ...deniedAttachmentCard, jobId: "job-1" },
        ],
      }),
    ).toEqual(["job-1", "job-2"]);
  });
});

describe("getDeniedAttachmentCards", () => {
  it("returns only denied attachment cards", () => {
    expect(
      getDeniedAttachmentCards(
        [deniedAttachmentCard, visibleAttachmentCard, approvalCard],
        new Set(["card-1"]),
      ),
    ).toEqual([deniedAttachmentCard]);
  });
});

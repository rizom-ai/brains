import { describe, expect, it } from "bun:test";
import type { InboundEmail } from "@brains/contracts";
import { applyVisibilityToMarkdown } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";

import {
  MailItemPlugin,
  createMailItemProjection,
  mailItemAdapter,
  mailCategorySchema,
  mailItemFrontmatterSchema,
  mailItemIdForMessage,
  mailItemSchema,
  mailTriageDecisionSchema,
  type MailItemFrontmatter,
  type RetainedMailClassification,
} from "../src";

const email: InboundEmail = {
  messageId: "<private-message@example.com>",
  sourceRef: "imap:opaque-source",
  threadId: "private-thread-id",
  from: { name: "Private Sender", address: "sender@example.com" },
  to: [{ name: "Private Recipient", address: "recipient@example.net" }],
  subject: "Exact private subject",
  receivedAt: "2026-04-15T09:00:00.000Z",
  text: "Exact private body that must not be copied.",
  html: "<p>Exact private HTML that must not be copied.</p>",
  headers: {
    autoSubmitted: "no",
    listUnsubscribe: "<mailto:private-unsubscribe@example.com>",
  },
  sender: { personId: "prsn_sender", permissionLevel: "trusted" },
};

const classification: RetainedMailClassification = {
  decision: "retain",
  title: "Potential advisory engagement",
  category: "opportunity",
  priority: "high",
  needsReply: true,
  organization: "Example Consulting",
  requestedActions: ["Review the proposed timeline"],
  summary:
    "A consulting prospect asks whether an advisory engagement is possible.",
};

const frontmatter: MailItemFrontmatter = {
  title: classification.title,
  category: classification.category,
  priority: classification.priority,
  status: "new",
  needsReply: classification.needsReply,
  receivedAt: email.receivedAt,
  source: {
    ref: email.sourceRef,
    senderKey:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    threadKey:
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    personId: "prsn_sender",
    domain: "example.com",
  },
  organization: classification.organization,
  requestedActions: classification.requestedActions,
};

describe("mail-item entity", () => {
  it("round-trips the restricted derived frontmatter and summary", () => {
    const content = mailItemAdapter.createMailItemContent(
      frontmatter,
      classification.summary,
    );
    const parsed = mailItemAdapter.parseMailItemContent(content);
    const entity = mailItemAdapter.fromMarkdown(content);

    expect(parsed).toEqual({
      frontmatter,
      summary: classification.summary,
    });
    expect(entity.metadata).toEqual({
      title: classification.title,
      category: "opportunity",
      priority: "high",
      status: "new",
      needsReply: true,
      receivedAt: email.receivedAt,
    });
    expect(
      mailItemSchema.parse({
        ...entity,
        id: "mail-example",
        created: email.receivedAt,
        updated: email.receivedAt,
        contentHash: "hash",
        visibility: "restricted",
      }),
    ).toBeDefined();
  });

  it("defines exactly five routing categories and rejects outcome values", () => {
    for (const category of [
      "opportunity",
      "recruiting",
      "work",
      "administrative",
      "personal",
    ]) {
      expect(mailCategorySchema.safeParse(category).success).toBe(true);
    }
    for (const category of ["spam", "unclassified", "other", "notification"]) {
      expect(
        mailItemFrontmatterSchema.safeParse({ ...frontmatter, category })
          .success,
      ).toBe(false);
      expect(
        mailTriageDecisionSchema.safeParse({ ...classification, category })
          .success,
      ).toBe(false);
    }
    expect(
      mailTriageDecisionSchema.safeParse({
        decision: "discard",
        reason: "spam",
      }).success,
    ).toBe(true);
    expect(
      mailTriageDecisionSchema.safeParse({
        ...classification,
        rationale: "Do not persist model reasoning",
      }).success,
    ).toBe(false);
    expect(
      mailItemFrontmatterSchema.safeParse({
        ...frontmatter,
        source: { ...frontmatter.source, ref: "" },
      }).success,
    ).toBe(false);
    expect(
      mailItemFrontmatterSchema.safeParse({
        ...frontmatter,
        source: { ...frontmatter.source, senderKey: "sender@example.com" },
      }).success,
    ).toBe(false);
  });

  it("derives stable opaque IDs and stores no original mailbox content", () => {
    const first = createMailItemProjection(email, classification);
    const second = createMailItemProjection(email, classification);
    const serialized = JSON.stringify(first);

    expect(first).toEqual(second);
    expect(first.id).toBe(mailItemIdForMessage(email.messageId));
    expect(first.id).toMatch(/^mail-[a-f0-9]{64}$/);
    expect(first.visibility).toBe("restricted");
    for (const sourceValue of [
      email.messageId,
      email.threadId,
      email.from.name,
      email.from.address,
      email.to[0]?.name,
      email.to[0]?.address,
      email.subject,
      email.text,
      email.html,
      email.headers.listUnsubscribe,
    ]) {
      if (sourceValue) expect(serialized).not.toContain(sourceValue);
    }
  });

  it("registers a validator that rejects any non-restricted persistence", async () => {
    const harness = createPluginHarness({ logContext: "mail-item-test" });
    const registry = harness.getEntityRegistry();
    type Validator = Parameters<typeof registry.registerPersistValidator>[1];
    let registeredEntityType: string | undefined;
    let validator: Validator | undefined;
    registry.registerPersistValidator = (entityType, candidate): void => {
      registeredEntityType = entityType;
      validator = candidate;
    };
    await harness.installPlugin(new MailItemPlugin());
    const projection = createMailItemProjection(email, classification);
    const entity = mailItemSchema.parse({
      ...projection,
      created: email.receivedAt,
      updated: email.receivedAt,
      contentHash: "hash",
    });

    expect(registeredEntityType).toBe("mail-item");
    if (!validator) throw new Error("Persist validator was not registered");
    expect(
      validator({ ...entity, visibility: "public" }, { operation: "create" }),
    ).rejects.toThrow("Mail items must have restricted visibility");
    expect(validator(entity, { operation: "create" })).resolves.toBeUndefined();
    const invalidUnclassifiedContent = mailItemAdapter.createMailItemContent(
      { ...frontmatter, category: null },
      classification.summary,
    );
    expect(
      validator(
        { ...entity, content: invalidUnclassifiedContent },
        { operation: "create" },
      ),
    ).rejects.toThrow(
      "Only the system fallback may have an unclassified category",
    );
  });
});

describe("mail item restricted export round-trip", () => {
  it("re-imports its own exported markdown including the system visibility key", () => {
    const content = mailItemAdapter.createMailItemContent(
      {
        title: "Unclassified email",
        category: null,
        priority: "high",
        status: "new",
        needsReply: true,
        receivedAt: "2026-08-09T15:53:55.000Z",
        source: {
          ref: "imap:inbound",
          senderKey: "a".repeat(64),
        },
        requestedActions: [],
      },
      "A content-safe summary.",
    );
    const exported = applyVisibilityToMarkdown(content, "restricted");

    const parsed = mailItemAdapter.parseMailItemContent(exported);

    expect(parsed.frontmatter.title).toBe("Unclassified email");
    expect(parsed.summary).toBe("A content-safe summary.");
  });
});

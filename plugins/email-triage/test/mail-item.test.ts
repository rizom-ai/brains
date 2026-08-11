import { describe, expect, it } from "bun:test";
import type { InboundEmail } from "@brains/contracts";
import { applyVisibilityToMarkdown } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";

import {
  MailItemPlugin,
  createMailItemProjection,
  createUnclassifiedMailItemProjection,
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
  sender: {
    personId: "prsn_sender",
    displayName: "Canonical Sender",
    permissionLevel: "trusted",
  },
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
    threadOrdinal: 2,
    personId: "prsn_sender",
    domain: "example.com",
  },
  senderLabel: "Canonical Sender · example.com",
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
      threadKey:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      threadOrdinal: 2,
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
    expect(
      mailItemFrontmatterSchema.safeParse({
        ...frontmatter,
        senderLabel: "sender@example.com",
      }).success,
    ).toBe(false);
    expect(
      mailItemFrontmatterSchema.safeParse({
        ...frontmatter,
        senderLabel: "x".repeat(301),
      }).success,
    ).toBe(false);
    for (const threadOrdinal of [0, -1, 1.5]) {
      expect(
        mailItemFrontmatterSchema.safeParse({
          ...frontmatter,
          source: { ...frontmatter.source, threadOrdinal },
        }).success,
      ).toBe(false);
    }
    const { threadKey: _threadKey, ...sourceWithoutThread } =
      frontmatter.source;
    expect(
      mailItemFrontmatterSchema.safeParse({
        ...frontmatter,
        source: { ...sourceWithoutThread, threadOrdinal: 1 },
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
    expect(serialized).toContain("Canonical Sender · example.com");
  });

  it("derives safe contact labels for classified and unclassified mail", () => {
    const projectionLabel = (
      input: InboundEmail,
      unclassified = false,
    ): {
      projection: ReturnType<typeof createMailItemProjection>;
      label: string | undefined;
    } => {
      const projection = unclassified
        ? createUnclassifiedMailItemProjection(input)
        : createMailItemProjection(input, classification);
      return {
        projection,
        label: mailItemAdapter.parseMailItemContent(projection.content)
          .frontmatter.senderLabel,
      };
    };

    const resolved = projectionLabel(email);
    const parsedName = projectionLabel({
      ...email,
      sender: undefined,
      from: { name: "Sam Rivera", address: "sam.rivera@acme.io" },
    });
    const domainOnly = projectionLabel({
      ...email,
      sender: undefined,
      from: { address: "sam.rivera@acme.io" },
    });
    const controlled = projectionLabel({
      ...email,
      sender: undefined,
      from: { name: "Sam\u0000 Rivera", address: "sam.rivera@acme.io" },
    });
    const addressShaped = projectionLabel({
      ...email,
      sender: undefined,
      from: {
        name: "Sam <sam.rivera@acme.io>",
        address: "sam.rivera@acme.io",
      },
    });
    const localPart = projectionLabel(
      {
        ...email,
        sender: undefined,
        from: { name: "sam.rivera", address: "sam.rivera@acme.io" },
      },
      true,
    );
    const bounded = projectionLabel({
      ...email,
      sender: undefined,
      from: { name: "N".repeat(1_000), address: "sender@acme.io" },
    });

    expect(resolved.label).toBe("Canonical Sender · example.com");
    expect(parsedName.label).toBe("Sam Rivera · acme.io");
    expect(domainOnly.label).toBe("acme.io");
    expect(controlled.label).toBe("Sam Rivera · acme.io");
    expect(addressShaped.label).toBe("acme.io");
    expect(localPart.label).toBe("acme.io");
    expect(bounded.label?.length).toBeLessThanOrEqual(300);

    for (const { projection } of [
      resolved,
      parsedName,
      domainOnly,
      controlled,
      addressShaped,
      localPart,
      bounded,
    ]) {
      const serialized = JSON.stringify(projection);
      expect(serialized).not.toContain("sam.rivera@acme.io");
      expect(serialized).not.toContain("Sam <sam.rivera@acme.io>");
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
  it("re-imports its own exported markdown including thread position and visibility", () => {
    const receivedAt = "2026-08-09T15:53:55.000Z";
    const threadKey = "b".repeat(64);
    const content = mailItemAdapter.createMailItemContent(
      {
        title: "Unclassified email",
        category: null,
        priority: "high",
        status: "new",
        needsReply: true,
        receivedAt,
        source: {
          ref: "imap:inbound",
          senderKey: "a".repeat(64),
          threadKey,
          threadOrdinal: 7,
        },
        requestedActions: [],
      },
      "A content-safe summary.",
    );
    const partial = mailItemAdapter.fromMarkdown(content);
    if (!partial.metadata) throw new Error("Expected mail metadata");
    const serialized = mailItemAdapter.toMarkdown({
      id: "mail-round-trip",
      entityType: "mail-item",
      content,
      metadata: partial.metadata,
      created: receivedAt,
      updated: receivedAt,
      contentHash: "hash",
      visibility: "restricted",
    });
    const exported = applyVisibilityToMarkdown(serialized, "restricted");

    const parsed = mailItemAdapter.parseMailItemContent(exported);

    expect(parsed.frontmatter.source).toMatchObject({
      threadKey,
      threadOrdinal: 7,
    });
    expect(mailItemAdapter.fromMarkdown(exported).metadata).toMatchObject({
      threadKey,
      threadOrdinal: 7,
    });
    expect(parsed.summary).toBe("A content-safe summary.");
  });
});

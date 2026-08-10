import { describe, expect, it } from "bun:test";
import type { InboundEmail } from "@brains/contracts";
import { inboxItemListSchema } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";

import {
  MailItemPlugin,
  MailTriageInboxSource,
  MailTriageOperatorService,
  createMailItemProjection,
  type MailPriority,
  type MailStatus,
} from "../src";

const receivedAt = "2026-08-05T09:00:00.000Z";

function createOperatorHarness(): ReturnType<typeof createPluginHarness> {
  const harness = createPluginHarness();
  const entityService = harness.getEntityService();
  entityService.countEntities = async (request): Promise<number> =>
    (
      await entityService.listEntities({
        entityType: request.entityType,
        ...(request.options ? { options: request.options } : {}),
      })
    ).length;
  return harness;
}

function inbound(id: string, timestamp: string): InboundEmail {
  return {
    messageId: `<private-${id}@mail.test>`,
    sourceRef: `imap:private-${id}`,
    from: { address: `private-${id}@sender.test` },
    to: [{ address: "operator-private@example.net" }],
    subject: `Mailbox subject ${id}`,
    receivedAt: timestamp,
    text: `Mailbox body ${id}`,
    headers: { listUnsubscribe: `https://private-${id}.list.test/remove` },
  };
}

async function persistItem(
  harness: ReturnType<typeof createPluginHarness>,
  input: {
    id: string;
    title: string;
    summary: string;
    priority: MailPriority;
    receivedAt: string;
    status?: MailStatus;
    sender?: InboundEmail["sender"];
  },
): Promise<string> {
  const email = {
    ...inbound(input.id, input.receivedAt),
    ...(input.sender ? { sender: input.sender } : {}),
  };
  const projection = createMailItemProjection(email, {
    decision: "retain",
    title: input.title,
    category: "work",
    priority: input.priority,
    needsReply: true,
    requestedActions: ["Review the request"],
    summary: input.summary,
  });
  const result = await harness.getEntityService().createEntity({
    entity: {
      ...projection,
      created: email.receivedAt,
      updated: email.receivedAt,
    },
  });
  if (input.status && input.status !== "new") {
    const operator = new MailTriageOperatorService(
      harness.getServiceContext("email-triage"),
    );
    await operator.act(
      {
        type:
          input.status === "reviewed"
            ? "mark-reviewed"
            : input.status === "handled"
              ? "mark-handled"
              : "archive",
        id: result.entityId,
      },
      { userPermissionLevel: "admin" },
    );
  }
  return result.entityId;
}

async function readStatus(
  harness: ReturnType<typeof createPluginHarness>,
  id: string,
): Promise<unknown> {
  const entity = await harness.getEntityService().getEntity({
    entityType: "mail-item",
    id,
    visibilityScope: "restricted",
  });
  return entity?.metadata["status"];
}

describe("mail triage inbox source", () => {
  it("maps only new derived mail items into content-safe inbox projections", async () => {
    const harness = createOperatorHarness();
    await harness.installPlugin(new MailItemPlugin());
    await persistItem(harness, {
      id: "high",
      title: "Time-sensitive work request",
      summary: "A project contact asks for a decision this week.",
      priority: "high",
      receivedAt: "2026-08-05T08:00:00.000Z",
      sender: {
        personId: "prsn_contact",
        displayName: "Known Contact",
        permissionLevel: "trusted",
      },
    });
    await persistItem(harness, {
      id: "normal",
      title: "Routine project update",
      summary: "A project contact shared a routine progress update.",
      priority: "normal",
      receivedAt: "2026-08-05T10:00:00.000Z",
    });
    await persistItem(harness, {
      id: "reviewed",
      title: "Already reviewed",
      summary: "The operator has already reviewed this item.",
      priority: "high",
      receivedAt,
      status: "reviewed",
    });

    const source = new MailTriageInboxSource(
      new MailTriageOperatorService(harness.getServiceContext("email-triage")),
    );
    const items = inboxItemListSchema.parse(await source.list());

    expect(source.sourceId).toBe("mail-items");
    expect(source.displayName).toBe("Email Triage");
    expect(items).toEqual([
      {
        id: expect.stringMatching(/^mail-[a-f0-9]{64}$/),
        title: "Routine project update",
        summary: "A project contact shared a routine progress update.",
        contact: { label: "sender.test" },
        receivedAt: "2026-08-05T10:00:00.000Z",
        urgency: "normal",
        entityRef: {
          entityType: "mail-item",
          entityId: expect.stringMatching(/^mail-[a-f0-9]{64}$/),
        },
        actions: [
          { id: "mark-reviewed", label: "Mark reviewed" },
          { id: "mark-handled", label: "Mark handled" },
          { id: "archive", label: "Archive", confirm: true },
        ],
      },
      {
        id: expect.stringMatching(/^mail-[a-f0-9]{64}$/),
        title: "Time-sensitive work request",
        summary: "A project contact asks for a decision this week.",
        contact: {
          label: "Known Contact · sender.test",
          personId: "prsn_contact",
        },
        receivedAt: "2026-08-05T08:00:00.000Z",
        urgency: "high",
        entityRef: {
          entityType: "mail-item",
          entityId: expect.stringMatching(/^mail-[a-f0-9]{64}$/),
        },
        actions: [
          { id: "mark-reviewed", label: "Mark reviewed" },
          { id: "mark-handled", label: "Mark handled" },
          { id: "archive", label: "Archive", confirm: true },
        ],
      },
    ]);
    for (const sourceValue of [
      "Mailbox subject high",
      "Mailbox body high",
      "private-high@sender.test",
      "operator-private@example.net",
      "imap:private-high",
      "<private-high@mail.test>",
      "private-high.list.test",
    ]) {
      expect(JSON.stringify(items)).not.toContain(sourceValue);
    }
  });

  it("enforces admin actions, reuses typed status transitions, and re-lists live state", async () => {
    const harness = createOperatorHarness();
    await harness.installPlugin(new MailItemPlugin());
    const reviewedId = await persistItem(harness, {
      id: "review-action",
      title: "Review action",
      summary: "A derived item ready for review.",
      priority: "normal",
      receivedAt,
    });
    const handledId = await persistItem(harness, {
      id: "handle-action",
      title: "Handle action",
      summary: "A derived item ready to handle.",
      priority: "high",
      receivedAt,
    });
    const archivedId = await persistItem(harness, {
      id: "archive-action",
      title: "Archive action",
      summary: "A derived item ready to archive.",
      priority: "low",
      receivedAt,
    });
    const source = new MailTriageInboxSource(
      new MailTriageOperatorService(harness.getServiceContext("email-triage")),
    );

    expect(
      source.act(handledId, "mark-handled", { permissionLevel: "trusted" }),
    ).rejects.toThrow("Email triage requires admin permission");
    expect(
      source.act(reviewedId, "delete", { permissionLevel: "admin" }),
    ).rejects.toThrow();

    await source.act(reviewedId, "mark-reviewed", {
      permissionLevel: "admin",
    });
    await source.act(handledId, "mark-handled", {
      permissionLevel: "admin",
    });
    await source.act(archivedId, "archive", { permissionLevel: "admin" });

    expect(await readStatus(harness, reviewedId)).toBe("reviewed");
    expect(await readStatus(harness, handledId)).toBe("handled");
    expect(await readStatus(harness, archivedId)).toBe("archived");
    expect(await source.list()).toEqual([]);
  });

  it("returns an empty state when no new mail items need attention", async () => {
    const harness = createOperatorHarness();
    await harness.installPlugin(new MailItemPlugin());
    const source = new MailTriageInboxSource(
      new MailTriageOperatorService(harness.getServiceContext("email-triage")),
    );

    expect(await source.list()).toEqual([]);
  });
});

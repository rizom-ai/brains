import { describe, expect, it } from "bun:test";
import type { InboundEmail } from "@brains/contracts";
import { createPluginHarness } from "@brains/plugins/test";

import {
  MailItemPlugin,
  MailTriageOperatorService,
  createMailItemProjection,
  mailTriageFilterSchema,
  mailTriageListResultSchema,
  mailTriageStatusActionResultSchema,
  mailTriageStatusActionSchema,
  type MailCategory,
  type MailPriority,
  type MailStatus,
} from "../src";

const receivedAt = "2026-08-03T09:00:00.000Z";

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

function inbound(id: string, received = receivedAt): InboundEmail {
  return {
    messageId: `<${id}@mail.test>`,
    sourceRef: `imap:${id}`,
    from: { address: `${id}@sender.test` },
    to: [{ address: "operator@example.net" }],
    subject: `Private ${id} subject`,
    receivedAt: received,
    text: `Private ${id} body`,
    headers: {},
  };
}

async function persistItem(
  harness: ReturnType<typeof createPluginHarness>,
  input: {
    id: string;
    title: string;
    category: MailCategory;
    priority: MailPriority;
    status?: MailStatus;
    needsReply: boolean;
    receivedAt?: string;
  },
): Promise<string> {
  const email = inbound(input.id, input.receivedAt);
  const projection = createMailItemProjection(email, {
    decision: "retain",
    title: input.title,
    category: input.category,
    priority: input.priority,
    needsReply: input.needsReply,
    requestedActions: [`Review ${input.id}`],
    summary: `Derived summary for ${input.id}.`,
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
        id: projection.id,
      },
      { userPermissionLevel: "admin" },
    );
  }
  return result.entityId;
}

describe("mail triage operator service", () => {
  it("keeps filters bounded and status mutations action-specific", () => {
    expect(mailTriageFilterSchema.parse({})).toEqual({ limit: 50 });
    expect(
      mailTriageFilterSchema.safeParse({ category: null, limit: 100 }).success,
    ).toBe(true);
    expect(mailTriageFilterSchema.safeParse({ limit: 101 }).success).toBe(
      false,
    );
    expect(
      mailTriageStatusActionSchema.safeParse({
        type: "set-status",
        id: "mail-1",
        status: "new",
      }).success,
    ).toBe(false);
  });

  it("applies combined filters and returns only restricted derived fields", async () => {
    const harness = createOperatorHarness();
    await harness.installPlugin(new MailItemPlugin());
    await persistItem(harness, {
      id: "matching",
      title: "Matching opportunity",
      category: "opportunity",
      priority: "high",
      needsReply: true,
    });
    await persistItem(harness, {
      id: "wrong-priority",
      title: "Routine opportunity",
      category: "opportunity",
      priority: "normal",
      needsReply: true,
    });
    await persistItem(harness, {
      id: "wrong-category",
      title: "Administrative notice",
      category: "administrative",
      priority: "high",
      needsReply: true,
    });

    const entityService = harness.getEntityService();
    const originalList = entityService.listEntities.bind(entityService);
    const visibilityScopes: unknown[] = [];
    const trackingList: typeof entityService.listEntities = (request) => {
      visibilityScopes.push(request.options?.filter?.visibilityScope);
      return originalList(request);
    };
    entityService.listEntities = trackingList;
    const operator = new MailTriageOperatorService(
      harness.getServiceContext("email-triage"),
    );
    const result = mailTriageListResultSchema.parse(
      await operator.list({
        category: "opportunity",
        priority: "high",
        status: "new",
        needsReply: true,
        limit: 10,
      }),
    );

    expect(result.total).toBe(1);
    expect(visibilityScopes).not.toHaveLength(0);
    expect(visibilityScopes.every((scope) => scope === "restricted")).toBe(
      true,
    );
    expect(result.items).toEqual([
      {
        id: expect.stringMatching(/^mail-[a-f0-9]{64}$/),
        title: "Matching opportunity",
        category: "opportunity",
        priority: "high",
        status: "new",
        needsReply: true,
        receivedAt,
        summary: "Derived summary for matching.",
        senderLabel: "sender.test",
        requestedActions: ["Review matching"],
      },
    ]);
    const serialized = JSON.stringify(result);
    for (const sourceValue of [
      "Private matching subject",
      "Private matching body",
      "matching@sender.test",
      "operator@example.net",
      "imap:matching",
      "<matching@mail.test>",
    ]) {
      expect(serialized).not.toContain(sourceValue);
    }
  });

  it("keeps dashboard attention counts new-only while retaining reviewed history", async () => {
    const harness = createOperatorHarness();
    await harness.installPlugin(new MailItemPlugin());
    await persistItem(harness, {
      id: "new-high",
      title: "Urgent administration",
      category: "administrative",
      priority: "high",
      needsReply: true,
      receivedAt: "2026-08-03T10:00:00.000Z",
    });
    await persistItem(harness, {
      id: "reviewed",
      title: "Reviewed work",
      category: "work",
      priority: "high",
      status: "reviewed",
      needsReply: true,
      receivedAt: "2026-08-03T08:00:00.000Z",
    });

    const operator = new MailTriageOperatorService(
      harness.getServiceContext("email-triage"),
    );

    expect(await operator.summary()).toEqual({
      new: 1,
      high: 1,
      needsReply: 1,
      unclassified: 0,
    });
    expect(
      (
        await operator.list({
          status: "reviewed",
          limit: 100,
        })
      ).items.map((item) => item.title),
    ).toEqual(["Reviewed work"]);
  });

  it("enforces Admin status actions and updates through one typed path", async () => {
    const harness = createOperatorHarness();
    await harness.installPlugin(new MailItemPlugin());
    const id = await persistItem(harness, {
      id: "status-action",
      title: "Status action",
      category: "work",
      priority: "normal",
      needsReply: true,
    });
    const operator = new MailTriageOperatorService(
      harness.getServiceContext("email-triage"),
    );

    expect(
      operator.act(
        { type: "mark-handled", id },
        { userPermissionLevel: "trusted" },
      ),
    ).rejects.toThrow("Email triage requires admin permission");

    const result = mailTriageStatusActionResultSchema.parse(
      await operator.act(
        { type: "mark-handled", id },
        { userPermissionLevel: "admin" },
      ),
    );
    expect(result).toEqual({ id, status: "handled" });
    const entity = await harness.getEntityService().getEntity({
      entityType: "mail-item",
      id,
      visibilityScope: "restricted",
    });
    expect(entity?.metadata["status"]).toBe("handled");
    expect(entity?.content).toContain("status: handled");
    expect(
      operator.act(
        { type: "mark-reviewed", id },
        { userPermissionLevel: "admin" },
      ),
    ).rejects.toThrow("Invalid mail item status transition");
  });
});

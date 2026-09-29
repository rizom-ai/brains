import { describe, expect, it } from "bun:test";
import type { InboundEmail } from "@brains/contracts";
import type {
  BaseEntity,
  EntitySchema,
  ListEntitiesRequest,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";

import {
  createMailItemProjection,
  mailTriageFilterSchema,
  mailTriageListResultSchema,
  mailTriageStatusActionResultSchema,
  mailTriageStatusActionSchema,
  type MailCategory,
  type MailPriority,
  type MailStatus,
} from "../src";

import { installMailItem, operatorFor } from "./helpers/install";

const receivedAt = "2026-08-03T09:00:00.000Z";

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
    const operator = operatorFor(harness);
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
    const harness = createPluginHarness();
    await installMailItem(harness);
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
    function trackingList(request: ListEntitiesRequest): Promise<BaseEntity[]>;
    function trackingList<T extends BaseEntity>(
      request: ListEntitiesRequest,
      schema: EntitySchema<T>,
    ): Promise<T[]>;
    function trackingList(
      request: ListEntitiesRequest,
      schema?: EntitySchema<BaseEntity>,
    ): Promise<BaseEntity[]> {
      visibilityScopes.push(request.options?.filter?.visibilityScope);
      return schema ? originalList(request, schema) : originalList(request);
    }
    entityService.listEntities = trackingList;
    const operator = operatorFor(harness);
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

  it("keeps inbox attention new-only while retaining reviewed history", async () => {
    const harness = createPluginHarness();
    await installMailItem(harness);
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

    const operator = operatorFor(harness);

    expect((await operator.listInboxItems()).map((item) => item.title)).toEqual(
      ["Urgent administration"],
    );
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
    const harness = createPluginHarness();
    await installMailItem(harness);
    const id = await persistItem(harness, {
      id: "status-action",
      title: "Status action",
      category: "work",
      priority: "normal",
      needsReply: true,
    });
    const operator = operatorFor(harness);

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

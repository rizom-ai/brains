import { describe, expect, it } from "bun:test";
import {
  InboxRegistry,
  type InboxActor,
  type InboxItem,
} from "@brains/plugins";

import {
  InboxDataSource,
  InboxOperatorService,
  inboxActionOutcomeSchema,
  inboxListResultSchema,
} from "../src";

const receivedAt = "2026-08-05T09:00:00.000Z";

function attentionItem(
  actions: InboxItem["actions"] = [
    { id: "mark-reviewed", label: "Mark reviewed" },
    { id: "archive", label: "Archive", confirm: true },
  ],
): InboxItem {
  return {
    id: "mail-opaque",
    title: "Time-sensitive work request",
    summary: "A project contact asks for a decision this week.",
    receivedAt,
    urgency: "high",
    actions,
  };
}

function createService(input?: { rejectActor?: (actor: InboxActor) => void }): {
  service: InboxOperatorService;
  actors: InboxActor[];
} {
  let open = true;
  const actors: InboxActor[] = [];
  const registry = new InboxRegistry();
  registry.registerSource("mail-plugin", {
    sourceId: "mail-items",
    displayName: "Email Triage",
    list: async () => (open ? [attentionItem()] : []),
    act: async (_itemId, _actionId, actor) => {
      actors.push(actor);
      input?.rejectActor?.(actor);
      open = false;
    },
  });
  registry.finalize();
  return {
    service: new InboxOperatorService(registry, new InboxDataSource(registry)),
    actors,
  };
}

describe("InboxOperatorService", () => {
  it("returns bounded filtered data for shared consumers", async () => {
    const fixture = createService();
    const result = inboxListResultSchema.parse(
      await fixture.service.list({
        sourceId: "mail-items",
        urgency: "high",
        limit: 10,
      }),
    );

    expect(result.total).toBe(1);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      source: { sourceId: "mail-items", displayName: "Email Triage" },
      item: { id: "mail-opaque", urgency: "high" },
    });
    expect(result.errors).toEqual([]);
  });

  it("filters before paging and returns bounded workspace totals", async () => {
    const registry = new InboxRegistry();
    registry.registerSource("mail-plugin", {
      sourceId: "mail-items",
      displayName: "Email Triage",
      list: async () => [
        attentionItem([]),
        {
          ...attentionItem([]),
          id: "mail-normal",
          urgency: "normal",
          receivedAt: "2026-08-04T09:00:00.000Z",
        },
      ],
      act: async () => undefined,
    });
    registry.registerSource("empty-plugin", {
      sourceId: "empty-source",
      displayName: "Empty Source",
      list: async () => [],
      act: async () => undefined,
    });
    registry.finalize();
    const service = new InboxOperatorService(
      registry,
      new InboxDataSource(registry),
    );

    const snapshot = await service.workspace({
      sourceId: "mail-items",
      urgency: "normal",
      offset: "0",
      limit: "1",
    });

    expect(snapshot).toMatchObject({
      summary: { open: 2, high: 1 },
      total: 1,
      offset: 0,
      limit: 1,
      entries: [{ item: { id: "mail-normal" } }],
      sources: [
        {
          source: { sourceId: "empty-source" },
          open: 0,
          high: 0,
          available: true,
        },
        {
          source: { sourceId: "mail-items" },
          open: 2,
          high: 1,
          available: true,
        },
      ],
    });
    expect(service.workspace({ offset: 0, limit: 101 })).rejects.toThrow();
  });

  it("requires confirmation before dispatching flagged actions and returns no projection after execution", async () => {
    const fixture = createService();
    const requested = inboxActionOutcomeSchema.parse(
      await fixture.service.act(
        {
          sourceId: "mail-items",
          itemId: "mail-opaque",
          actionId: "archive",
        },
        { permissionLevel: "admin" },
      ),
    );

    expect(requested).toEqual({
      kind: "confirmation",
      summary: 'Archive "Time-sensitive work request"?',
    });
    expect(fixture.actors).toEqual([]);

    const completed = inboxActionOutcomeSchema.parse(
      await fixture.service.act(
        {
          sourceId: "mail-items",
          itemId: "mail-opaque",
          actionId: "archive",
          confirmed: true,
        },
        { permissionLevel: "admin" },
      ),
    );

    expect(fixture.actors).toEqual([{ permissionLevel: "admin" }]);
    expect(completed).toEqual({ kind: "completed" });
  });

  it("builds a five-entry Dashboard allowlist without source identifiers or actions", async () => {
    const registry = new InboxRegistry();
    registry.registerSource("mail-plugin", {
      sourceId: "mail-items",
      displayName: "Email Triage",
      list: async () =>
        Array.from({ length: 6 }, (_, index) => ({
          ...attentionItem(),
          id: `private-id-${index}`,
          title: `Attention ${index}`,
          receivedAt: `2026-08-05T0${index}:00:00.000Z`,
        })),
      act: async () => undefined,
    });
    registry.finalize();
    const service = new InboxOperatorService(
      registry,
      new InboxDataSource(registry),
    );

    const dashboard = await service.dashboard("/cms/workspaces/inbox");
    const serialized = JSON.stringify(dashboard);

    expect(dashboard.entries).toHaveLength(5);
    expect(dashboard).toMatchObject({
      summary: {
        open: 6,
        high: 6,
        availableSources: 1,
        unavailableSources: 0,
      },
      managementUrl: "/cms/workspaces/inbox",
    });
    expect(Object.keys(dashboard.entries[0] ?? {})).toEqual([
      "sourceLabel",
      "urgency",
      "title",
      "receivedAt",
    ]);
    expect(serialized).not.toContain("private-id");
    expect(serialized).not.toContain("mark-reviewed");
    expect(serialized).not.toContain("decision this week");
  });

  it("passes the caller to the source so source-owned authorization remains authoritative", async () => {
    const fixture = createService({
      rejectActor: (actor) => {
        if (actor.permissionLevel !== "admin") {
          throw new Error("Source requires admin permission");
        }
      },
    });

    expect(
      fixture.service.act(
        {
          sourceId: "mail-items",
          itemId: "mail-opaque",
          actionId: "mark-reviewed",
        },
        { permissionLevel: "trusted" },
      ),
    ).rejects.toThrow("Source requires admin permission");
    expect(fixture.actors).toEqual([{ permissionLevel: "trusted" }]);
  });

  it("rejects actions that are not currently offered by the owning source", async () => {
    const fixture = createService();

    expect(
      fixture.service.act(
        {
          sourceId: "mail-items",
          itemId: "mail-opaque",
          actionId: "delete",
          confirmed: true,
        },
        { permissionLevel: "admin" },
      ),
    ).rejects.toThrow("Inbox item or action not found");
    expect(fixture.actors).toEqual([]);
  });
});

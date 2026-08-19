import { describe, expect, it } from "bun:test";
import {
  InboxFollowUpRegistry,
  InboxRegistry,
  type InboxActor,
  type InboxItem,
} from "@brains/plugins";

import {
  InboxDataSource,
  InboxOperatorService,
  inboxActionOutcomeSchema,
  inboxDetailOutcomeSchema,
  inboxListResultSchema,
  inboxWorkspaceQuerySchema,
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
    contact: { label: "Sam Rivera · acme.io", personId: "prsn_sam" },
    entityRef: { entityType: "mail-item", entityId: "mail-opaque" },
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
  const followUps = new InboxFollowUpRegistry();
  followUps.finalize();
  return {
    service: new InboxOperatorService(
      registry,
      new InboxDataSource(registry),
      followUps,
    ),
    actors,
  };
}

describe("InboxOperatorService", () => {
  it("returns a bounded content-safe allowlist for headless consumers", async () => {
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
      item: {
        title: "Time-sensitive work request",
        summary: "A project contact asks for a decision this week.",
        urgency: "high",
        receivedAt,
        contact: { label: "Sam Rivera · acme.io", personId: "prsn_sam" },
      },
    });
    expect(Object.keys(result.entries[0]?.item ?? {})).toEqual([
      "title",
      "summary",
      "contact",
      "receivedAt",
      "urgency",
    ]);
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
        {
          ...attentionItem([]),
          id: "mail-normal-later",
          urgency: "normal",
          receivedAt: "2026-08-03T09:00:00.000Z",
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
    const followUps = new InboxFollowUpRegistry();
    followUps.finalize();
    const service = new InboxOperatorService(
      registry,
      new InboxDataSource(registry),
      followUps,
    );

    const snapshot = await service.workspace(
      inboxWorkspaceQuerySchema.parse({
        sourceId: "mail-items",
        urgency: "normal",
        selected: "mail-items:mail-normal-later",
        offset: "0",
        limit: "1",
      }),
      { permissionLevel: "admin" },
    );

    expect(snapshot).toMatchObject({
      summary: { open: 3, high: 1 },
      total: 2,
      offset: 0,
      limit: 1,
      entries: [{ item: { id: "mail-normal" } }],
      selectedEntry: { item: { id: "mail-normal-later" } },
      sources: [
        {
          source: { sourceId: "empty-source" },
          open: 0,
          high: 0,
          available: true,
        },
        {
          source: { sourceId: "mail-items" },
          open: 3,
          high: 1,
          available: true,
        },
      ],
    });
    expect(snapshot.entries[0]?.detailAvailable).toBe(false);
    expect(
      inboxWorkspaceQuerySchema.safeParse({ offset: 0, limit: 101 }).success,
    ).toBe(false);
  });

  it("filters source-scoped facets consistently and ignores orphaned selections", async () => {
    const registry = new InboxRegistry();
    registry.registerSource("mail-plugin", {
      sourceId: "mail-items",
      displayName: "Email Triage",
      facets: [
        {
          key: "category",
          label: "Category",
          values: [
            { value: "work", label: "Work" },
            { value: "opportunity", label: "Opportunity" },
          ],
        },
        {
          key: "needs-reply",
          label: "Needs reply",
          values: [
            { value: "true", label: "Yes" },
            { value: "false", label: "No" },
          ],
        },
      ],
      list: async () => [
        {
          ...attentionItem([]),
          id: "mail-work",
          facets: { category: "work", "needs-reply": "true" },
        },
        {
          ...attentionItem([]),
          id: "mail-opportunity",
          facets: { category: "opportunity", "needs-reply": "false" },
        },
        {
          ...attentionItem([]),
          id: "mail-without-facets",
        },
      ],
      act: async () => undefined,
    });
    registry.registerSource("candidate-plugin", {
      sourceId: "candidate-items",
      displayName: "Candidates",
      facets: [
        {
          key: "category",
          label: "Review state",
          values: [{ value: "review", label: "Needs review" }],
        },
      ],
      list: async () => [
        {
          ...attentionItem([]),
          id: "candidate-review",
          urgency: "normal",
          facets: { category: "review" },
        },
      ],
      act: async () => undefined,
    });
    registry.finalize();
    const followUps = new InboxFollowUpRegistry();
    followUps.finalize();
    const service = new InboxOperatorService(
      registry,
      new InboxDataSource(registry),
      followUps,
    );

    const workspace = await service.workspace(
      {
        sourceId: "mail-items",
        urgency: "high",
        facets: { category: "work", "needs-reply": "true" },
        offset: 0,
        limit: 50,
      },
      { permissionLevel: "admin" },
    );
    const headless = await service.list({
      sourceId: "mail-items",
      urgency: "high",
      facets: { category: "work", "needs-reply": "true" },
      limit: 50,
    });

    expect(workspace.entries.map((entry) => entry.item.id)).toEqual([
      "mail-work",
    ]);
    expect(headless.entries.map((entry) => entry.item.title)).toEqual([
      "Time-sensitive work request",
    ]);
    expect(workspace.total).toBe(1);
    expect(headless.total).toBe(1);

    const independent = await service.workspace(
      {
        sourceId: "candidate-items",
        "facet.category": "review",
      },
      { permissionLevel: "admin" },
    );
    expect(independent.entries.map((entry) => entry.item.id)).toEqual([
      "candidate-review",
    ]);

    const crossSource = await service.workspace(
      {
        sourceId: "candidate-items",
        "facet.category": "work",
        "facet.needs-reply": "true",
      },
      { permissionLevel: "admin" },
    );
    expect(crossSource.entries.map((entry) => entry.item.id)).toEqual([
      "candidate-review",
    ]);
  });

  it("resolves universal follow-ups only for the bounded workspace page", async () => {
    const registry = new InboxRegistry();
    registry.registerSource("mail-plugin", {
      sourceId: "mail-items",
      displayName: "Email Triage",
      list: async () => [attentionItem()],
      act: async () => undefined,
    });
    registry.finalize();
    const followUps = new InboxFollowUpRegistry();
    followUps.registerKind("chat", {
      kind: "discuss-in-chat",
      label: "Discuss in chat",
      priority: 10,
      mode: "universal",
      permissionLevel: "trusted",
      applies: ({ item }) => item.entityRef !== undefined,
      resolve: ({ item }) => ({
        href: "/chat",
        state: {
          webChatPrefill: {
            version: 1,
            text: `About inbox item: ${item.title}`,
          },
        },
      }),
    });
    followUps.finalize();
    const service = new InboxOperatorService(
      registry,
      new InboxDataSource(registry),
      followUps,
    );

    const snapshot = await service.workspace({}, { permissionLevel: "admin" });
    const headless = await service.list({ limit: 10 });

    expect(snapshot.entries[0]?.followUps).toEqual([
      {
        kind: "discuss-in-chat",
        label: "Discuss in chat",
        href: "/chat",
        state: {
          webChatPrefill: {
            version: 1,
            text: "About inbox item: Time-sensitive work request",
          },
        },
      },
    ]);
    expect(JSON.stringify(headless)).not.toContain("discuss-in-chat");
    expect(JSON.stringify(headless)).not.toContain("mail-opaque");
  });

  it("revalidates offered items and fixes private source-detail failures", async () => {
    let open = true;
    let detailReads = 0;
    const registry = new InboxRegistry();
    registry.registerSource("mail-plugin", {
      sourceId: "mail-items",
      displayName: "Email Triage",
      list: async () => (open ? [attentionItem()] : []),
      resolveDetail: async (_itemId, actor, signal) => {
        detailReads += 1;
        expect(actor).toEqual({ permissionLevel: "admin" });
        expect(signal.aborted).toBe(false);
        return {
          kind: "plain",
          text: "Original private message",
          truncated: false,
        };
      },
      act: async () => undefined,
    });
    registry.finalize();
    const followUps = new InboxFollowUpRegistry();
    followUps.finalize();
    const service = new InboxOperatorService(
      registry,
      new InboxDataSource(registry),
      followUps,
    );
    const request = {
      type: "detail" as const,
      sourceId: "mail-items",
      itemId: "mail-opaque",
    };

    expect(
      inboxDetailOutcomeSchema.parse(
        await service.detail(request, { permissionLevel: "admin" }),
      ),
    ).toEqual({
      kind: "detail",
      detail: {
        kind: "plain",
        text: "Original private message",
        truncated: false,
      },
    });
    expect(detailReads).toBe(1);

    expect(
      await service.detail(request, { permissionLevel: "trusted" }),
    ).toEqual({
      kind: "detail-unavailable",
      error: "Original content is unavailable",
    });
    expect(detailReads).toBe(1);

    open = false;
    expect(await service.detail(request, { permissionLevel: "admin" })).toEqual(
      {
        kind: "detail-unavailable",
        error: "Original content is unavailable",
      },
    );
    expect(detailReads).toBe(1);
  });

  it("requires confirmation before dispatching flagged actions and returns no projection after execution", async () => {
    const fixture = createService();
    const requested = inboxActionOutcomeSchema.parse(
      await fixture.service.act(
        {
          sourceId: "mail-items",
          itemId: "mail-opaque",
          actionId: "archive",
          confirmed: false,
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
    const followUps = new InboxFollowUpRegistry();
    followUps.finalize();
    const service = new InboxOperatorService(
      registry,
      new InboxDataSource(registry),
      followUps,
    );

    const dashboard = await service.dashboard();
    const serialized = JSON.stringify(dashboard);

    expect(dashboard.entries).toHaveLength(5);
    expect(dashboard).toMatchObject({
      summary: {
        open: 6,
        high: 6,
        availableSources: 1,
        unavailableSources: 0,
      },
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
    expect(serialized).not.toContain("Sam Rivera");
    expect(serialized).not.toContain("prsn_sam");
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
          confirmed: false,
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

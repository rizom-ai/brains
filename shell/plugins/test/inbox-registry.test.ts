import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  InboxRegistry,
  inboxFacetDefinitionsSchema,
  inboxItemSchema,
  type InboxActor,
  type InboxItem,
  type InboxSource,
} from "../src/inbox-registry";
import { ServicePlugin } from "../src/service/service-plugin";
import type { ServicePluginContext } from "../src/service/context";
import { createPluginHarness } from "../src/test/harness";

function sourceItem(sourceId: string): InboxItem {
  return {
    id: `${sourceId}-1`,
    title: `Item from ${sourceId}`,
    receivedAt: "2026-08-04T09:00:00.000Z",
    urgency: "normal",
    actions: [{ id: "dismiss", label: "Dismiss" }],
  };
}

function source(
  sourceId: string,
  options: {
    onAct?: (
      itemId: string,
      actionId: string,
      actor: InboxActor,
    ) => Promise<void>;
  } = {},
): InboxSource {
  return {
    sourceId,
    displayName: `Source ${sourceId}`,
    list: async () => [sourceItem(sourceId)],
    act: options.onAct ?? (async (): Promise<void> => undefined),
  };
}

describe("InboxRegistry", () => {
  it("defines bounded schema-first inbox items", () => {
    expect(
      inboxItemSchema.parse({
        id: "mail-1",
        title: "Derived mail summary",
        summary: "A safe derived summary.",
        contact: { label: "Sam Rivera · acme.io", personId: "prsn_sam" },
        threadOrdinal: 2,
        receivedAt: "2026-08-04T09:00:00.000Z",
        urgency: "high",
        entityRef: { entityType: "mail-item", entityId: "mail-1" },
        facets: {
          category: "work",
          "mail-priority": "high",
          "needs-reply": "true",
        },
        actions: [
          { id: "review", label: "Mark reviewed" },
          { id: "archive", label: "Archive", confirm: true },
        ],
      }),
    ).toEqual({
      id: "mail-1",
      title: "Derived mail summary",
      summary: "A safe derived summary.",
      contact: { label: "Sam Rivera · acme.io", personId: "prsn_sam" },
      threadOrdinal: 2,
      receivedAt: "2026-08-04T09:00:00.000Z",
      urgency: "high",
      entityRef: { entityType: "mail-item", entityId: "mail-1" },
      facets: {
        category: "work",
        "mail-priority": "high",
        "needs-reply": "true",
      },
      actions: [
        { id: "review", label: "Mark reviewed" },
        { id: "archive", label: "Archive", confirm: true },
      ],
    });
    expect(
      inboxItemSchema.safeParse({
        id: "mail-1",
        title: "Derived mail summary",
        contact: { label: "x".repeat(301) },
        receivedAt: "2026-08-04T09:00:00.000Z",
        urgency: "normal",
        actions: [],
      }).success,
    ).toBe(false);
    expect(
      inboxItemSchema.safeParse({
        id: "mail-1",
        title: "Derived mail summary",
        contact: { label: "Sam", personId: "x".repeat(201) },
        receivedAt: "2026-08-04T09:00:00.000Z",
        urgency: "normal",
        actions: [],
      }).success,
    ).toBe(false);
    for (const threadOrdinal of [0, -1, 1.5]) {
      expect(
        inboxItemSchema.safeParse({
          id: "mail-1",
          title: "Derived mail summary",
          threadOrdinal,
          receivedAt: "2026-08-04T09:00:00.000Z",
          urgency: "normal",
          actions: [],
        }).success,
      ).toBe(false);
    }
    expect(
      inboxItemSchema.safeParse({
        id: "mail-1",
        title: "Derived mail summary",
        receivedAt: "not-a-date",
        urgency: "urgent",
        actions: [],
      }).success,
    ).toBe(false);
    for (const facets of [
      Object.fromEntries(
        Array.from({ length: 9 }, (_, index) => [`facet-${index}`, "value"]),
      ),
      { ["x".repeat(41)]: "value" },
      { category: "x".repeat(41) },
    ]) {
      expect(
        inboxItemSchema.safeParse({
          id: "mail-1",
          title: "Derived mail summary",
          receivedAt: "2026-08-04T09:00:00.000Z",
          urgency: "normal",
          facets,
          actions: [],
        }).success,
      ).toBe(false);
    }
    expect(
      inboxItemSchema.safeParse({
        id: "mail-1",
        title: "Derived mail summary",
        receivedAt: "2026-08-04T09:00:00.000Z",
        urgency: "normal",
        actions: [
          { id: "same", label: "First" },
          { id: "same", label: "Second" },
        ],
      }).success,
    ).toBe(false);
  });

  it("validates bounded source facet definitions and source-owned item values", async () => {
    const definitions = [
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
    ];
    expect(inboxFacetDefinitionsSchema.parse(definitions)).toEqual(definitions);

    for (const invalid of [
      Array.from({ length: 9 }, (_, index) => ({
        key: `facet-${index}`,
        label: `Facet ${index}`,
        values: [{ value: "value", label: "Value" }],
      })),
      [definitions[0], definitions[0]],
      [
        {
          key: "category",
          label: "Category",
          values: [
            { value: "work", label: "Work" },
            { value: "work", label: "Duplicate" },
          ],
        },
      ],
      [
        {
          key: "x".repeat(41),
          label: "Category",
          values: [{ value: "work", label: "Work" }],
        },
      ],
      [
        {
          key: "category",
          label: "x".repeat(101),
          values: [{ value: "work", label: "Work" }],
        },
      ],
      [
        {
          key: "category",
          label: "Category",
          values: Array.from({ length: 21 }, (_, index) => ({
            value: `value-${index}`,
            label: `Value ${index}`,
          })),
        },
      ],
      [{ key: "category", label: "Category", values: [] }],
      [
        {
          key: "category",
          label: "Category",
          values: [{ value: "x".repeat(41), label: "Value" }],
        },
      ],
      [
        {
          key: "category",
          label: "Category",
          values: [{ value: "work", label: "x".repeat(101) }],
        },
      ],
    ]) {
      expect(inboxFacetDefinitionsSchema.safeParse(invalid).success).toBe(
        false,
      );
    }

    const registry = new InboxRegistry();
    registry.registerSource("mail-plugin", {
      ...source("mail-items"),
      facets: definitions,
      list: async () => [
        {
          ...sourceItem("mail-items"),
          facets: { category: "work", "needs-reply": "true" },
        },
      ],
    });
    registry.finalize();
    const registered = registry.getSource("mail-items");
    if (!registered) throw new Error("Expected registered mail source");
    expect(registered.facets).toEqual(definitions);
    expect(Object.isFrozen(registered.facets)).toBe(true);
    expect(Object.isFrozen(registered.facets?.[0]?.values)).toBe(true);
    const listed = await registered.list();
    expect(listed).toMatchObject([
      { facets: { category: "work", "needs-reply": "true" } },
    ]);
    expect(Object.isFrozen(listed[0]?.facets)).toBe(true);

    const invalidItemRegistry = new InboxRegistry();
    invalidItemRegistry.registerSource("mail-plugin", {
      ...source("invalid-mail"),
      facets: definitions,
      list: async () => [
        {
          ...sourceItem("invalid-mail"),
          facets: { category: "undeclared" },
        },
      ],
    });
    invalidItemRegistry.finalize();
    const invalidSource = invalidItemRegistry.getSource("invalid-mail");
    if (!invalidSource) throw new Error("Expected invalid mail source");
    expect(invalidSource.list()).rejects.toThrow();
  });

  it("rejects duplicate sources deterministically at finalization", () => {
    const registry = new InboxRegistry();
    registry.registerSource("first-plugin", source("mail-items"));
    registry.registerSource("second-plugin", source("mail-items"));

    expect(() => registry.finalize()).toThrow(
      'Inbox source "mail-items" is registered by multiple plugins: first-plugin, second-plugin',
    );
  });

  it("freezes composition before reads and releases plugin-owned sources", async () => {
    const registry = new InboxRegistry();
    const actions: Array<{
      itemId: string;
      actionId: string;
      actor: InboxActor;
    }> = [];
    registry.registerSource(
      "mail-plugin",
      source("mail-items", {
        onAct: async (itemId, actionId, actor) => {
          actions.push({ itemId, actionId, actor });
        },
      }),
    );

    expect(() => registry.listSources()).toThrow(
      "Inbox registry is not finalized",
    );
    registry.finalize();
    const registered = registry.getSource("mail-items");
    expect(registered?.displayName).toBe("Source mail-items");
    expect(await registered?.list()).toHaveLength(1);
    await registered?.act("mail-items-1", "dismiss", {
      permissionLevel: "admin",
    });
    expect(actions).toEqual([
      {
        itemId: "mail-items-1",
        actionId: "dismiss",
        actor: { permissionLevel: "admin" },
      },
    ]);

    registry.unregisterPlugin("mail-plugin");
    expect(registry.listSources()).toEqual([]);
    expect(() => registry.registerSource("late", source("late"))).toThrow(
      "Inbox registration is closed",
    );
  });

  it("exposes plugin-scoped source registration to service plugins", async () => {
    class InboxSourcePlugin extends ServicePlugin<
      Record<string, never>,
      Record<string, never>
    > {
      constructor() {
        super(
          "inbox-source-test",
          { name: "inbox-source-test", version: "1.0.0" },
          {},
          z.strictObject({}),
        );
      }

      protected override async onRegister(
        context: ServicePluginContext,
      ): Promise<void> {
        context.inbox.registerSource(source("synthetic"));
      }
    }

    const harness = createPluginHarness<InboxSourcePlugin>({
      logContext: "inbox-source-test",
    });
    await harness.installPlugin(new InboxSourcePlugin());
    await harness.finalizeRegistration();

    expect(
      harness
        .getMockShell()
        .getInboxRegistry()
        .listSources()
        .map((entry) => entry.sourceId),
    ).toEqual(["synthetic"]);
  });
});

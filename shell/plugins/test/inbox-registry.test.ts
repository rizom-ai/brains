import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  InboxRegistry,
  inboxItemSchema,
  type InboxActor,
  type InboxSource,
} from "../src/inbox-registry";
import { ServicePlugin } from "../src/service/service-plugin";
import type { ServicePluginContext } from "../src/service/context";
import { createPluginHarness } from "../src/test/harness";

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
    list: async () => [
      {
        id: `${sourceId}-1`,
        title: `Item from ${sourceId}`,
        receivedAt: "2026-08-04T09:00:00.000Z",
        urgency: "normal",
        actions: [{ id: "dismiss", label: "Dismiss" }],
      },
    ],
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
        receivedAt: "2026-08-04T09:00:00.000Z",
        urgency: "high",
        entityRef: { entityType: "mail-item", entityId: "mail-1" },
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
      receivedAt: "2026-08-04T09:00:00.000Z",
      urgency: "high",
      entityRef: { entityType: "mail-item", entityId: "mail-1" },
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
    expect(
      inboxItemSchema.safeParse({
        id: "mail-1",
        title: "Derived mail summary",
        receivedAt: "not-a-date",
        urgency: "urgent",
        actions: [],
      }).success,
    ).toBe(false);
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

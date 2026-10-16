import { beforeEach, describe, expect, it } from "bun:test";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { ActionBoardPlugin } from "../src";

describe("ActionBoardPlugin", () => {
  let harness: PluginTestHarness<ActionBoardPlugin>;
  let plugin: ActionBoardPlugin;

  beforeEach(() => {
    harness = createPluginHarness<ActionBoardPlugin>({
      dataDir: "/tmp/test-datadir",
    });
    plugin = new ActionBoardPlugin();
  });

  it("takes its projects from a grouping key, `projects` unless configured", () => {
    expect(() => new ActionBoardPlugin()).not.toThrow();
    expect(
      () => new ActionBoardPlugin({ projectGrouping: "initiatives" }),
    ).not.toThrow();
    expect(
      () => new ActionBoardPlugin({ projectGrouping: "Our Projects" }),
    ).toThrow();
  });

  it("registers the action-item update tool for chat", async () => {
    const capabilities = await harness.installPlugin(plugin);

    expect(capabilities.tools.map((tool) => tool.name)).toEqual([
      "action_item_update",
    ]);
  });

  it("opens the Board in Studio when ready and closes it on shutdown", async () => {
    await harness.installPlugin(plugin);
    const bus = harness.getMockShell().getMessageBus();
    const registered: string[] = [];
    const unregistered: unknown[] = [];
    bus.subscribe<{ id: string }, { workspaceUrl: string }>(
      "studio:register-workspace",
      async (message) => {
        registered.push(message.payload.id);
        return { success: true, data: { workspaceUrl: "/studio/board" } };
      },
    );
    bus.subscribe("studio:unregister-workspace", async (message) => {
      unregistered.push(message.payload);
      return { success: true };
    });

    await plugin.ready();
    await plugin.shutdown();

    expect(registered).toEqual(["action-board:board"]);
    expect(unregistered).toEqual([
      {
        pluginId: "action-board",
        workspaceId: "action-board:board",
      },
    ]);
  });

  it("brings blocked action items to the Inbox", async () => {
    await harness.installPlugin(plugin);
    const inbox = harness.getMockShell().getInboxRegistry();
    inbox.finalize();

    expect(inbox.getSource("action-items")?.displayName).toBe("Action items");
  });

  it("offers to track Inbox items on the Board once the Board is open", async () => {
    await harness.installPlugin(plugin);
    const shell = harness.getMockShell();
    shell
      .getMessageBus()
      .subscribe<{ id: string }, { workspaceUrl: string }>(
        "studio:register-workspace",
        async () => ({
          success: true,
          data: {
            workspaceUrl: "/studio/workspaces/action-board%3Aboard",
          },
        }),
      );
    const followUps = shell.getInboxFollowUpRegistry();
    followUps.finalize();
    const contact = {
      id: "req-1",
      title: "Could we share your field notes?",
      summary: "Grace asks about our field notes.",
      receivedAt: "2026-10-15T10:12:00.000Z",
      urgency: "normal" as const,
      entityRef: { entityType: "contact-request", entityId: "req-1" },
      actions: [],
    };
    const trusted = { permissionLevel: "trusted" as const };
    const tracking = async (
      sourceId: string,
      item: typeof contact | Omit<typeof contact, "entityRef">,
    ): Promise<string | undefined> =>
      (
        await followUps.resolveUniversal({ sourceId, item, actor: trusted })
      ).find((followUp) => followUp.kind === "track-as-action-item")?.href;

    expect(await tracking("contact-requests", contact)).toBeUndefined();

    await plugin.ready();

    const href = await tracking("contact-requests", contact);
    expect(href?.startsWith("/studio/workspaces/action-board%3Aboard?")).toBe(
      true,
    );
    const query = new URL(href ?? "", "https://brain.test").searchParams;
    expect(Object.fromEntries(query)).toEqual({
      trackSource: "contact-requests",
      trackType: "contact-request",
      trackId: "req-1",
      trackTitle: "Could we share your field notes?",
      trackSummary: "Grace asks about our field notes.",
    });
    expect(await tracking("action-items", contact)).toBeUndefined();
    const { entityRef: _entityRef, ...unreferenced } = contact;
    expect(await tracking("contact-requests", unreferenced)).toBeUndefined();
  });
});

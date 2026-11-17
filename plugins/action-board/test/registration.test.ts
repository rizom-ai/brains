import { describe, expect, it } from "bun:test";
import type { Plugin, PluginCapabilities } from "@brains/plugins";
import {
  createMockShell,
  type MockShell,
  registerAll,
} from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import { createActionBoardPlugins } from "./board-plugins";

interface Installed {
  shell: MockShell;
  plugins: Plugin[];
  capabilities: PluginCapabilities[];
}

async function installed(
  options: { executionOnly?: boolean; config?: Record<string, unknown> } = {},
): Promise<Installed> {
  const shell = createMockShell();
  const plugins = createActionBoardPlugins(options.config);
  const capabilities = await registerAll(shell, plugins, options);
  return { shell, plugins, capabilities };
}

/** Studio, as the shell answers a workspace registration over the bus. */
function studio(shell: MockShell): {
  registered: unknown[];
  unregistered: unknown[];
} {
  const registered: unknown[] = [];
  const unregistered: unknown[] = [];
  const bus = shell.getMessageBus();
  bus.subscribe<Record<string, unknown>, { workspaceUrl: string }>(
    "studio:register-workspace",
    async ({ payload }) => {
      registered.push({
        id: payload["id"],
        label: payload["label"],
        permission: payload["permission"],
        pluginId: payload["pluginId"],
      });
      return {
        success: true,
        data: { workspaceUrl: "/studio/workspaces/action-board%3Aboard" },
      };
    },
  );
  bus.subscribe("studio:unregister-workspace", async ({ payload }) => {
    unregistered.push(payload);
    return { success: true };
  });
  return { registered, unregistered };
}

const toolSchema = z.object({
  name: z.string(),
  description: z.string(),
  visibility: z.string().optional(),
  sideEffects: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()),
});

/**
 * What the action board registers, pinned as the action-board plugin class
 * registered it: chat adds and moves cards through its two tools, the
 * Inbox shows blocked cards and offers to track an item as one, and Studio
 * shows the Board once the brain is ready.
 */
describe("the action board's registered surface", () => {
  it("is the action-board service, with no resources, instructions, routes, jobs, templates, data sources or types", async () => {
    const { shell, plugins, capabilities } = await installed();
    expect(
      plugins.map(({ id, type, packageName, dependencies }) => [
        id,
        type,
        packageName,
        dependencies ?? [],
      ]),
    ).toEqual([["action-board", "service", "@brains/action-board", []]]);
    expect(capabilities.flatMap(({ resources }) => resources)).toEqual([]);
    expect(
      capabilities.map(({ instructions }) => instructions ?? null),
    ).toEqual([null]);
    for (const plugin of plugins) {
      expect(plugin.getWebRoutes?.() ?? []).toEqual([]);
      expect(plugin.getApiRoutes?.() ?? []).toEqual([]);
    }
    expect(shell.getJobQueueService().getRegisteredTypes()).toEqual([]);
    expect([...shell.getTemplates().keys()]).toEqual([]);
    expect(shell.getDataSourceRegistry().list()).toEqual([]);
    expect(shell.getEntityRegistry().getAllEntityTypes()).toEqual([]);
  });

  it("gives chat its two trusted, writing tools, in every process", async () => {
    for (const executionOnly of [false, true]) {
      const { capabilities } = await installed({ executionOnly });
      const tools = capabilities
        .flatMap(({ tools: list }) => list)
        .map((tool) => toolSchema.parse(tool));
      expect(
        tools.map(({ name, visibility, sideEffects, inputSchema }) => [
          name,
          visibility,
          sideEffects,
          Object.keys(inputSchema),
        ]),
      ).toEqual([
        [
          "action_item_create",
          "trusted",
          "writes",
          ["title", "details", "assignee", "due"],
        ],
        ["action_item_update", "trusted", "writes", ["id", "status", "note"]],
      ]);
      expect(tools.map(({ description }) => description)).toEqual([
        "Add an action item (a card on the board) when someone asks for one, recorded as requested by the caller. Use this, not system_create, for action items.",
        "Move an action item to open, doing, blocked, done or dropped, and/or add a note to it. The change is recorded under the caller's name. Use this, not system_update, for an action item's status or notes.",
      ]);
    }
  });

  it("brings blocked cards to the Inbox and offers tracking, in the main process only", async () => {
    const { shell } = await installed();
    const inbox = shell.getInboxRegistry();
    inbox.finalize();
    expect(inbox.getSource("action-items")?.displayName).toBe("Action items");
    const followUps = shell.getInboxFollowUpRegistry();
    followUps.finalize();
    expect(
      followUps
        .listKinds()
        .map(({ kind, label, priority, mode, permissionLevel }) => ({
          kind,
          label,
          priority,
          mode,
          permissionLevel,
        })),
    ).toEqual([
      {
        kind: "track-as-action-item",
        label: "Track as action item",
        priority: 15,
        mode: "universal",
        permissionLevel: "trusted",
      },
    ]);

    const worker = await installed({ executionOnly: true });
    worker.shell.getInboxRegistry().finalize();
    expect(worker.shell.getInboxRegistry().getSource("action-items")).toBe(
      undefined,
    );
    worker.shell.getInboxFollowUpRegistry().finalize();
    expect(worker.shell.getInboxFollowUpRegistry().listKinds()).toEqual([]);
  });

  it("opens the Board in Studio once ready and takes it off at shutdown", async () => {
    const { shell, plugins } = await installed();
    const { registered, unregistered } = studio(shell);
    for (const plugin of plugins) await plugin.ready?.();
    expect(registered).toEqual([
      {
        id: "action-board:board",
        label: "Board",
        permission: "trusted",
        pluginId: "action-board",
      },
    ]);
    for (const plugin of plugins) await plugin.shutdown?.();
    expect(unregistered).toEqual([
      { pluginId: "action-board", workspaceId: "action-board:board" },
    ]);
  });

  it("takes its projects from a grouping key, `projects` unless configured", () => {
    expect(() => createActionBoardPlugins()).not.toThrow();
    expect(() =>
      createActionBoardPlugins({ projectGrouping: "initiatives" }),
    ).not.toThrow();
    expect(() =>
      createActionBoardPlugins({ projectGrouping: "Our Projects" }),
    ).toThrow();
  });
});

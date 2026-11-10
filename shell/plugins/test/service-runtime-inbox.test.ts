import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  createServicePluginContext,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type InboxItem,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service that reads the Inbox, as the unified inbox does,
 * reads the sources other plugins registered and the follow-ups their
 * destinations resolve, as its class read them through `context.inbox` and
 * `context.inboxFollowUps`. It registers nothing there.
 */

async function runtimeOf(shell: MockShell): Promise<ServiceRuntime> {
  let runtime: ServiceRuntime | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    defineServicePlugin(
      { id: "probe", config: z.object({}) },
      {
        subscriptions: (context) => {
          runtime = serviceRuntime(context);
          return [];
        },
      },
    ),
    {},
    { name: "@brains/probe", version: "0.1.0" },
    { pluginId: "probe" },
  );
  if (!plugin) throw new Error("No plugin");
  await plugin.register(shell);
  if (!runtime) throw new Error("No runtime");
  return runtime;
}

const item: InboxItem = {
  id: "mail-1",
  title: "Review the proposal",
  receivedAt: "2026-08-13T08:00:00.000Z",
  urgency: "high",
  entityRef: { entityType: "mail-item", entityId: "mail-1" },
  actions: [],
};

describe("a first-party service reading the Inbox", () => {
  it("reads the sources and follow-ups other plugins registered", async () => {
    const shell = createMockShell();
    const runtime = await runtimeOf(shell);
    const mail = createServicePluginContext(shell, "mail");
    mail.inbox.registerSource({
      sourceId: "mail-items",
      displayName: "Email Triage",
      list: async () => [item],
      act: async () => undefined,
    });
    mail.inboxFollowUps.registerKind({
      kind: "open-entity",
      label: "Open source entity",
      priority: 30,
      mode: "universal",
      permissionLevel: "trusted",
      applies: () => true,
      resolve: () => ({ href: "/studio/entities/mail-item/mail-1" }),
    });
    shell.getInboxRegistry().finalize();
    shell.getInboxFollowUpRegistry().finalize();

    expect(runtime.inbox.listSources().map(({ sourceId }) => sourceId)).toEqual(
      ["mail-items"],
    );
    expect(runtime.inbox.getSource("mail-items")?.displayName).toBe(
      "Email Triage",
    );
    expect(runtime.inbox.getSource("missing")).toBeUndefined();
    expect(
      (
        await runtime.inboxFollowUps.resolve({
          sourceId: "mail-items",
          item,
          actor: { permissionLevel: "admin" },
        })
      ).map(({ kind, href }) => ({ kind, href })),
    ).toEqual([
      { kind: "open-entity", href: "/studio/entities/mail-item/mail-1" },
    ]);
    // A reader registers nothing.
    expect("registerSource" in runtime.inbox).toBe(false);
    expect("registerKind" in runtime.inboxFollowUps).toBe(false);
  });
});

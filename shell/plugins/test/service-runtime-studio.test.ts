import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type Plugin,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service converted from a class reaches what Studio's
 * service class did through its context: the Inbox follow-ups it offers,
 * the brain's readiness and channel descriptors, the editor's reads and
 * writes, the shared upload store, and the members it may assign.
 */

async function runtimeOn(
  shell: MockShell,
  executionOnly = false,
  id = "probe",
): Promise<{ runtime: ServiceRuntime; plugin: Plugin }> {
  let runtime: ServiceRuntime | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    defineServicePlugin({
      id,
      config: z.object({}),
      setup: (context) => {
        runtime = serviceRuntime(context);
        return {};
      },
    }),
    {},
    { name: `@brains/${id}`, version: "0.1.0" },
    { pluginId: id },
  );
  if (!plugin) throw new Error("No plugin");
  await plugin.register(
    shell,
    executionOnly ? { executionOnly: true } : undefined,
  );
  if (!runtime) throw new Error("Setup did not run");
  return { runtime, plugin };
}

describe("a first-party service reaching what Studio's class did", () => {
  it("offers an Inbox follow-up kind under its plugin id, as its class registered one", async () => {
    const shell = createMockShell();
    const { runtime } = await runtimeOn(shell);
    runtime.inboxFollowUpKind({
      kind: "open-entity",
      label: "Open source entity",
      priority: 30,
      mode: "universal",
      permissionLevel: "trusted",
      applies: () => true,
      resolve: () => ({ href: "/studio/entities/note/a" }),
    });
    const registry = shell.getInboxFollowUpRegistry();
    registry.finalize();
    expect(
      registry.listKinds().map(({ kind, label }) => [kind, label]),
    ).toEqual([["open-entity", "Open source entity"]]);
    // Under the plugin id: taking the plugin's kinds off takes it off.
    registry.unregisterPlugin("probe");
    expect(registry.listKinds()).toEqual([]);
  });

  it("reads the brain's readiness, as its class read context.readiness", async () => {
    const shell = createMockShell();
    const { runtime } = await runtimeOn(shell);
    expect(await runtime.readiness()).toEqual(
      await shell.getRuntimeReadiness(),
    );
  });

  it("lists the channel descriptors other packages registered, as its class did", async () => {
    const shell = createMockShell();
    const channels = shell.getChannelRegistry();
    channels.registerDescriptor("test-email", {
      type: "email",
      displayName: "Email",
      subjectLabel: "Email address",
    });
    channels.finalize();
    const { runtime } = await runtimeOn(shell);
    expect(runtime.channelDescriptors()).toEqual(channels.listDescriptors());
    expect(runtime.channelDescriptors().map(({ type }) => type)).toEqual([
      "email",
    ]);
  });
});

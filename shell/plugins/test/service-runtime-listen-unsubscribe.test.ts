import { describe, expect, it } from "bun:test";
import { defineChannel } from "@brains/contracts";
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
 * A first-party service converted from a class stops hearing a channel
 * when it asks, as its class unsubscribed with what context.messaging
 * returned: directory-sync hears job progress only while it waits for its
 * startup batches. A listener it never stops is still released when the
 * package shuts down, and one it stopped is not released twice.
 */

const progress = defineChannel("probe:progress", z.object({ id: z.string() }));

async function runtimeOn(
  shell: MockShell,
): Promise<{ runtime: ServiceRuntime; plugin: Plugin }> {
  let runtime: ServiceRuntime | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    defineServicePlugin({
      id: "probe",
      config: z.object({}),
      setup: (context) => {
        runtime = serviceRuntime(context);
        return {};
      },
    }),
    {},
    { name: "@brains/probe", version: "0.1.0" },
    { pluginId: "probe" },
  );
  if (!plugin) throw new Error("No plugin");
  await plugin.register(shell);
  if (!runtime) throw new Error("Setup did not run");
  return { runtime, plugin };
}

async function announce(shell: MockShell, id: string): Promise<void> {
  await shell.getMessageBus().send({
    type: progress.name,
    payload: { id },
    sender: "shell",
    broadcast: true,
  });
}

describe("a first-party service's listener it stops itself", () => {
  it("hears nothing once stopped, and its shutdown leaves others listening", async () => {
    const shell = createMockShell();
    const { runtime, plugin } = await runtimeOn(shell);
    const heard: string[] = [];
    const stop = runtime.listen(progress, ({ payload }) => {
      heard.push(payload.id);
    });
    await announce(shell, "before");
    stop();
    await announce(shell, "after");
    expect(heard).toEqual(["before"]);

    // Someone else hears the channel; the package's shutdown releases
    // nothing twice, so they keep hearing it.
    const others: string[] = [];
    shell
      .getMessageBus()
      .subscribe<{ id: string }>(progress.name, async (message) => {
        others.push(message.payload.id);
        return { success: true };
      });
    stop();
    await plugin.shutdown?.();
    await announce(shell, "later");
    expect(others).toEqual(["later"]);
  });

  it("is released when the package shuts down, if never stopped", async () => {
    const shell = createMockShell();
    const { runtime, plugin } = await runtimeOn(shell);
    const heard: string[] = [];
    runtime.listen(progress, ({ payload }) => {
      heard.push(payload.id);
    });
    await plugin.shutdown?.();
    await announce(shell, "after");
    expect(heard).toEqual([]);
  });
});

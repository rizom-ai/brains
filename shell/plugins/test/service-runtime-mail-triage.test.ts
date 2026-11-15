import { describe, expect, it } from "bun:test";
import { baseEntitySchema } from "@brains/entity-service";
import { createTestEntityAdapter } from "@brains/entity-service/test";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  createServicePluginContext,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type InboxSource,
  type Plugin,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service converted from a class takes the part in the
 * brain its class took: it offers an Inbox source under its plugin's id,
 * resolves an editable prompt by its target with its default, counts a
 * type's records at the scope it names, and knows whether it runs in a
 * job worker, each as its class did through its context. Email triage's
 * Inbox, its classification prompt and its thread ordinals use them.
 */

async function runtimeOn(
  shell: MockShell,
  executionOnly = false,
): Promise<{
  runtime: ServiceRuntime;
  plugin: Plugin;
}> {
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
  await plugin.register(
    shell,
    executionOnly ? { executionOnly: true } : undefined,
  );
  if (!runtime) throw new Error("Setup did not run");
  return { runtime, plugin };
}

const triage: InboxSource = {
  sourceId: "email-triage",
  displayName: "Email",
  list: async () => [],
  act: async () => {},
};

describe("a first-party service's part in the brain", () => {
  it("offers an Inbox source under its plugin's id, as its class did", async () => {
    const shell = createMockShell();
    const { runtime } = await runtimeOn(shell);

    runtime.inboxSource(triage);
    // The shell closes Inbox registration once every plugin has registered.
    shell.getInboxRegistry().finalize();

    // The registry keeps its own wrapper over the source as registered.
    const registered = runtime.inbox.getSource("email-triage");
    expect(registered?.displayName).toBe("Email");
    expect(await registered?.list()).toEqual([]);
    expect(
      createServicePluginContext(shell, "reader").inbox.getSource(
        "email-triage",
      )?.displayName,
    ).toBe("Email");
  });

  it("resolves a prompt by its target, falling back to its default", async () => {
    const shell = createMockShell();
    const { runtime } = await runtimeOn(shell);
    const context = createServicePluginContext(shell, "probe");

    expect(
      await runtime.prompts.resolve("probe:classification", "The default"),
    ).toBe(
      await context.prompts.resolve("probe:classification", "The default"),
    );
    expect(
      await runtime.prompts.resolve("probe:classification", "The default"),
    ).toBe("The default");
  });

  it("counts a type's records at the scope it names", async () => {
    const shell = createMockShell();
    shell
      .getEntityRegistry()
      .registerEntityType(
        "mail-item",
        baseEntitySchema,
        createTestEntityAdapter("mail-item"),
      );
    const at = new Date().toISOString();
    shell.addEntities([
      {
        id: "item-1",
        entityType: "mail-item",
        content: "Mail",
        contentHash: "a",
        metadata: {},
        visibility: "restricted",
        created: at,
        updated: at,
      },
    ]);
    const { runtime } = await runtimeOn(shell);

    expect(
      await runtime.entityReads.countEntities({
        entityType: "mail-item",
        options: { filter: { visibilityScope: "restricted" } },
      }),
    ).toBe(1);
    expect(
      await runtime.entityReads.countEntities({ entityType: "mail-item" }),
    ).toBe(0);
  });

  it("knows whether it runs in a job worker", async () => {
    expect((await runtimeOn(createMockShell())).runtime.executionOnly).toBe(
      false,
    );
    expect(
      (await runtimeOn(createMockShell(), true)).runtime.executionOnly,
    ).toBe(true);
  });
});

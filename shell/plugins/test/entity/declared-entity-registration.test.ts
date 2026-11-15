import { beforeEach, describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  defineEntity,
  defineEntityPackage,
  defineProjectionRule,
  instantiatePluginPackageDefinition,
} from "../../src";
import { createPluginHarness } from "../../src/test/harness";

type Plugin = NonNullable<
  ReturnType<typeof instantiatePluginPackageDefinition>[number]
>;

/** A rule that writes the type it is declared on. */
const waveRule = defineProjectionRule({
  id: "wave-item-rule",
  version: "1",
  sources: [{ kind: "entity", types: ["document"] }],
  targetType: "wave-item",
  inputSchema: z.object({}),
  selectInput: async () => ({}),
  derive: async () => [],
});

function installedType(
  definition: Parameters<typeof defineEntityPackage>[0]["entities"][number],
): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "items", entities: [definition] }),
    {},
    { name: "@fixture/items", version: "1.0.0" },
  );
  if (!plugin) throw new Error("No entity type");
  return plugin;
}

function waveItem(
  config?: Parameters<typeof defineEntity>[0]["config"],
): Plugin {
  return installedType(
    defineEntity({
      type: "wave-item",
      purpose: "An item a projection writes.",
      metadata: z.object({}),
      projectionRules: [waveRule],
      ...(config ? { config } : {}),
    }),
  );
}

describe("a declared entity type's registration", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    harness = createPluginHarness({ logger: createSilentLogger() });
  });

  it("registers its type and serves no tools or resources", async () => {
    const plugin = installedType(
      defineEntity({
        type: "test-item",
        purpose: "A test item.",
        metadata: z.object({}),
      }),
    );
    const capabilities = await harness.installPlugin(plugin);

    expect(plugin.type).toBe("entity");
    expect(capabilities.tools).toEqual([]);
    expect(capabilities.resources).toEqual([]);
    expect(harness.getEntityRegistry().hasEntityType("test-item")).toBe(true);
  });

  it("publishes its rules, and fails closed as a source of what it writes", async () => {
    const capabilities = await harness.installPlugin(waveItem());

    expect(capabilities.projectionRules?.map(({ id }) => id)).toEqual([
      "wave-item-rule",
    ]);
    expect("projections" in capabilities).toBe(false);
    expect(
      harness.getEntityRegistry().getEntityTypeConfig("wave-item"),
    ).toMatchObject({
      projectionSource: false,
      projectionSourceRole: "excluded",
    });
  });

  it("keeps an explicit projection source opt-in", async () => {
    await harness.installPlugin(
      waveItem({ projectionSourceRole: "supporting" }),
    );

    const config = harness.getEntityRegistry().getEntityTypeConfig("wave-item");
    expect(config.projectionSourceRole).toBe("supporting");
    expect(config.projectionSource).toBeUndefined();
  });

  it("normalizes an excluded role to the fail-closed source policy", async () => {
    await harness.installPlugin(waveItem({ projectionSourceRole: "excluded" }));

    expect(
      harness.getEntityRegistry().getEntityTypeConfig("wave-item"),
    ).toMatchObject({
      projectionSource: false,
      projectionSourceRole: "excluded",
    });
  });

  it("resolves a prompt to its fallback while no prompt entity exists", async () => {
    const plugin = waveItem();
    await harness.installPlugin(plugin);

    const context = harness.getEntityContext(plugin.id);
    expect(
      await context.prompts.resolve("test:generation", "My default prompt"),
    ).toBe("My default prompt");
  });

  it("registers no extraction handler: projections derive instead", async () => {
    const registered: string[] = [];
    const shell = harness.getMockShell();
    const jobQueue = shell.getJobQueueService();
    shell.getJobQueueService = (): ReturnType<
      typeof shell.getJobQueueService
    > => ({
      ...jobQueue,
      registerHandler: (type: string): void => {
        registered.push(type);
      },
    });

    await waveItem().register(shell);

    expect(registered.some((type) => type.endsWith(":extract"))).toBe(false);
  });
});

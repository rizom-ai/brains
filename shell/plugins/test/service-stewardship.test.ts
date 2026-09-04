import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import type { EntityAdapter, BaseEntity } from "@brains/entity-service";
import { baseEntitySchema } from "@brains/entity-service";
import { createPluginHarness } from "../src/test/harness";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "../src";

// A system type the shell registered before any plugin — the shape
// anchor-profile and brain-character have for @brains/profile.
const SYSTEM_TYPE = "anchor-doc";

function minimalAdapter(): EntityAdapter<BaseEntity> {
  return {
    entityType: SYSTEM_TYPE,
    // The base schema really is this type's schema: the stewardship rules
    // under test read no metadata, so there is nothing narrower to describe.
    schema: baseEntitySchema,
    purpose: "A system-owned singleton.",
    fromMarkdown: () => ({}),
    toMarkdown: (entity: BaseEntity) => entity.content,
    extractMetadata: () => ({}),
    parseFrontMatter: <T>(_markdown: string, schema: z.ZodSchema<T>): T =>
      schema.parse({}),
    generateFrontMatter: () => "",
    getBodyTemplate: () => "",
  };
}

function harnessWithSystemType(): ReturnType<typeof createPluginHarness> {
  const harness = createPluginHarness();
  harness
    .getEntityRegistry()
    .registerEntityType(SYSTEM_TYPE, z.object({}), minimalAdapter());
  return harness;
}

function stewardPlugin(options?: {
  id?: string;
  packageName?: string;
  stewards?: readonly string[];
  onReady?: (entities: {
    create: (entity: {
      id: string;
      entityType: string;
      content: string;
      metadata: Record<string, unknown>;
    }) => Promise<unknown>;
  }) => Promise<void>;
}): Plugin {
  const definition = defineServicePlugin({
    id: options?.id ?? "identity-desk",
    config: z.object({}),
    setup: () => ({}),
    ...(options?.stewards ? { stewards: options.stewards } : {}),
    ...(options?.onReady
      ? {
          ready: async ({ entities }): Promise<void> => {
            await options.onReady?.(entities);
          },
        }
      : {}),
  });
  const plugin = instantiatePluginPackageDefinition(
    definition,
    {},
    {
      name: options?.packageName ?? "@fixture/identity-desk",
      version: "0.1.0",
    },
  )[0];
  if (!plugin) throw new Error("Service plugin was not created");
  return plugin;
}

describe("a service stewarding a system entity type", () => {
  it("may write the stewarded type from ready", async () => {
    const harness = harnessWithSystemType();
    let writeError: unknown = null;
    const plugin = stewardPlugin({
      stewards: [SYSTEM_TYPE],
      onReady: async (entities) => {
        try {
          await entities.create({
            id: SYSTEM_TYPE,
            entityType: SYSTEM_TYPE,
            content: "seeded",
            metadata: {},
          });
        } catch (error) {
          writeError = error;
        }
      },
    });
    await harness.installPlugin(plugin);
    await plugin.ready?.();
    expect(writeError).toBeNull();
  });

  it("still refuses writes to types it neither declares nor stewards", async () => {
    const harness = harnessWithSystemType();
    let writeError: unknown = null;
    const plugin = stewardPlugin({
      onReady: async (entities) => {
        try {
          await entities.create({
            id: SYSTEM_TYPE,
            entityType: SYSTEM_TYPE,
            content: "seeded",
            metadata: {},
          });
        } catch (error) {
          writeError = error;
        }
      },
    });
    await harness.installPlugin(plugin);
    await plugin.ready?.();
    expect(String(writeError)).toContain("may only write entity types");
  });

  it("refuses stewardship of a type nothing registered", async () => {
    const harness = createPluginHarness();
    const plugin = stewardPlugin({ stewards: ["phantom-type"] });
    expect(harness.installPlugin(plugin)).rejects.toThrow(/phantom-type/);
  });

  it("refuses a second steward for the same type", async () => {
    const harness = harnessWithSystemType();
    const first = stewardPlugin({
      stewards: [SYSTEM_TYPE],
    });
    const second = stewardPlugin({
      id: "identity-rival",
      packageName: "@fixture/identity-rival",
      stewards: [SYSTEM_TYPE],
    });
    await harness.installPlugin(first);
    expect(harness.installPlugin(second)).rejects.toThrow(/steward/);
  });
});

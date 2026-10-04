import { describe, expect, test } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

const item = defineEntity({
  type: "item",
  purpose: "Configured fixture",
  metadata: z.object({ title: z.string() }),
});
const foreign = defineEntity({
  type: "foreign",
  purpose: "Foreign fixture",
  metadata: z.object({}),
});
const metadata = { name: "@fixture/configured", version: "0.0.0-test" };

describe("configured entity packages", () => {
  test("parsed configuration stays instance-local and only changes declared behavior", async () => {
    const definition = defineEntityPackage({
      id: "configured",
      entities: [item],
      config: z.object({ reason: z.string().default("default reason") }),
      configure: ({ config }) => [
        {
          entity: item,
          create: {
            fromContent: {
              resolve: async ({
                ai,
                entities,
              }): Promise<{ refuse: string }> => {
                expect(typeof ai.generateObject).toBe("function");
                expect(typeof entities.nearest).toBe("function");
                return { refuse: config.reason };
              },
            },
          },
          evals: { configured: async (): Promise<string> => config.reason },
        },
      ],
    });
    expect(definition.family).toBe("entity");
    const first = instantiatePluginPackageDefinition(
      definition,
      { reason: "first" },
      metadata,
    );
    const second = instantiatePluginPackageDefinition(definition, {}, metadata);
    for (const [plugins, reason] of [
      [first, "first"],
      [second, "default reason"],
    ] as const) {
      const harness = createPluginHarness();
      const evals = new Map<string, (input: unknown) => Promise<unknown>>();
      harness.getMockShell().registerEvalHandler = (
        _pluginId,
        id,
        handler,
      ): void => {
        evals.set(id, handler);
      };
      for (const plugin of plugins) await harness.installPlugin(plugin);
      const interceptor = harness
        .getEntityRegistry()
        .getCreateInterceptor("item");
      if (!interceptor) throw new Error("Expected configured interceptor");
      expect(
        await interceptor(
          { entityType: "item", content: "body" },
          {
            interfaceType: "test",
            actor: { kind: "user", userId: "operator" },
          },
        ),
      ).toMatchObject({
        kind: "handled",
        result: { success: false, error: reason },
      });
      expect(await evals.get("configured")?.({})).toBe(reason);
      expect(harness.getEntityService().getEntityTypes()).toContain("item");
    }
    expect(() =>
      instantiatePluginPackageDefinition(definition, { reason: 1 }, metadata),
    ).toThrow();
  });
  test("refuses foreign or duplicate bindings and repeated declarations", () => {
    const definition = defineEntityPackage({
      id: "configured",
      entities: [item],
      config: z.object({}),
      configure: () => [{ entity: foreign }],
    });
    expect(() =>
      instantiatePluginPackageDefinition(definition, {}, metadata),
    ).toThrow("undeclared entity");
    const duplicate = defineEntityPackage({
      id: "configured",
      entities: [item],
      config: z.object({}),
      configure: () => [{ entity: item }, { entity: item }],
    });
    expect(() =>
      instantiatePluginPackageDefinition(duplicate, {}, metadata),
    ).toThrow("Duplicate configuration");
    expect(() =>
      defineEntityPackage({ id: "duplicate", entities: [item, item] }),
    ).toThrow("duplicate entity types");
  });
  test("snapshots routing and eval records before authors can mutate them", async () => {
    const create = {
      fromContent: {
        resolve: async (): Promise<{ refuse: string }> => ({
          refuse: "original",
        }),
      },
    };
    const evals = { value: async (): Promise<string> => "original" };
    const definition = defineEntityPackage({
      id: "configured",
      entities: [item],
      config: z.object({}),
      configure: () => [{ entity: item, create, evals }],
    });
    const plugins = instantiatePluginPackageDefinition(
      definition,
      {},
      metadata,
    );
    create.fromContent.resolve = async (): Promise<{ refuse: string }> => ({
      refuse: "changed",
    });
    evals.value = async (): Promise<string> => "changed";
    const harness = createPluginHarness();
    const handlers = new Map<string, (input: unknown) => Promise<unknown>>();
    harness.getMockShell().registerEvalHandler = (
      _pluginId,
      id,
      handler,
    ): void => {
      handlers.set(id, handler);
    };
    for (const plugin of plugins) await harness.installPlugin(plugin);
    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("item");
    if (!interceptor) throw new Error("Expected interceptor");
    expect(
      await interceptor(
        { entityType: "item", content: "body" },
        { interfaceType: "test", actor: { kind: "user", userId: "operator" } },
      ),
    ).toMatchObject({ result: { error: "original" } });
    expect(await handlers.get("value")?.({})).toBe("original");
  });
});

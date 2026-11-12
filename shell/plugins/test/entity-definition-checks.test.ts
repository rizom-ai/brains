import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  type AnyEntityDefinition,
  type EntityCheckContext,
  type EntityCheckResult,
} from "../src";

type Harness = ReturnType<typeof createPluginHarness>;

const page = defineEntity({
  type: "page",
  purpose: "A saved page that can go stale.",
  metadata: z.object({ title: z.string(), checkedAt: z.string() }),
});

function watcher(seen: { context?: EntityCheckContext }): AnyEntityDefinition {
  return defineEntity({
    type: "watcher",
    purpose: "Watches saved pages.",
    metadata: z.object({}),
    checks: [
      {
        id: "stale-pages",
        cadence: "weekly",
        includeInInbox: false,
        run: async (context): Promise<EntityCheckResult> => {
          seen.context = context;
          const pages = await context.entities.list(page);
          const stale = pages.filter(
            ({ metadata }) => metadata.checkedAt < "2026-01-01",
          );
          return {
            alerts: stale.map(({ id, metadata }) => ({
              dedupeKey: `stale:${id}`,
              title: `${metadata.title} is stale`,
              body: `Recheck ${context.siteUrl ?? ""}/pages/${id}`,
            })),
          };
        },
      },
    ],
  });
}

async function install(
  entities: readonly AnyEntityDefinition[],
): Promise<Harness> {
  const plugins = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "pages", entities }),
    {},
    { name: "@fixture/pages", version: "0.1.0" },
  );
  const harness = createPluginHarness({
    logger: createSilentLogger("entity-checks"),
    domain: "reader.example",
  });
  for (const plugin of plugins) await harness.installPlugin(plugin);
  return harness;
}

describe("declared checks", () => {
  it("registers each check under the declaring plugin and runs it as the package", async () => {
    const seen: { context?: EntityCheckContext } = {};
    const harness = await install([page, watcher(seen)]);
    try {
      await harness.getEntityService().createEntity({
        entity: {
          id: "old",
          entityType: "page",
          content: "",
          metadata: { title: "Old", checkedAt: "2025-03-01" },
          visibility: "restricted",
        },
      });
      const check = harness
        .getMockShell()
        .getRecurringCheck("@fixture/pages:watcher:stale-pages");
      if (!check) throw new Error("The check was not registered");
      expect(check).toMatchObject({
        id: "stale-pages",
        cadence: "weekly",
        includeInInbox: false,
      });
      expect(check.deliverAlerts).toBeUndefined();

      const signal = new AbortController().signal;
      expect(await check.run({ signal })).toEqual({
        alerts: [
          {
            dedupeKey: "stale:old",
            title: "Old is stale",
            body: "Recheck https://reader.example/pages/old",
          },
        ],
      });
      expect(seen.context?.signal).toBe(signal);
      expect(Object.isFrozen(seen.context)).toBe(true);
    } finally {
      await harness.reset();
    }
  });

  it("releases its checks on shutdown", async () => {
    const harness = await install([page, watcher({})]);
    await harness.reset();
    expect(
      harness
        .getMockShell()
        .getRecurringCheck("@fixture/pages:watcher:stale-pages"),
    ).toBeUndefined();
  });

  it("refuses a check id that is not local or appears twice", () => {
    const run = async (): Promise<Record<string, never>> => ({});
    expect(() =>
      defineEntity({
        type: "watcher",
        purpose: "Bad id.",
        metadata: z.object({}),
        checks: [{ id: "Stale Pages", cadence: "daily", run }],
      }),
    ).toThrow();
    expect(() =>
      defineEntity({
        type: "watcher",
        purpose: "Twice.",
        metadata: z.object({}),
        checks: [
          { id: "stale", cadence: "daily", run },
          { id: "stale", cadence: "weekly", run },
        ],
      }),
    ).toThrow('Entity "watcher" declares check "stale" twice');
  });
});

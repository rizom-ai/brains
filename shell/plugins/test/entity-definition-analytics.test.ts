import { describe, expect, it } from "bun:test";
import type { UserPermissionLevel } from "@brains/templates";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineEntityAnalyticsReport,
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  type AnyEntityDefinition,
} from "../src";

type Harness = ReturnType<typeof createPluginHarness>;

const clip = defineEntity({
  type: "clip",
  purpose: "A clipped passage.",
  metadata: z.object({
    title: z.string(),
    words: z.number(),
    status: z.enum(["draft", "published"]),
  }),
});

// Reports read other types by their definitions, as any reader does.
const library = defineEntity({
  type: "library",
  purpose: "The reader's library, which reports on its clips.",
  metadata: z.object({}),
  analyticsReports: [
    defineEntityAnalyticsReport({
      type: "clip-length",
      description: "How long the clipped passages are.",
      params: z.object({ minWords: z.number().int().nonnegative().default(0) }),
      report: async ({ minWords }, { entities, visibility }) => {
        const clips = await entities.list(clip);
        const long = clips.filter((saved) => saved.metadata.words >= minWords);
        return {
          visibility,
          count: long.length,
          titles: long.map((saved) => saved.metadata.title).sort(),
        };
      },
    }),
    defineEntityAnalyticsReport({
      type: "clip-audit",
      description: "Every clip, for the operator.",
      params: z.object({}),
      minVisibility: "admin",
      report: async (_params, { entities }) => ({
        total: await entities.count(clip),
      }),
    }),
  ],
});

async function install(
  entities: readonly AnyEntityDefinition[],
): Promise<Harness> {
  const plugins = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "clips", entities }),
    {},
    { name: "@fixture/clips", version: "0.1.0" },
  );
  const harness = createPluginHarness({
    logger: createSilentLogger("entity-analytics"),
  });
  for (const plugin of plugins) await harness.installPlugin(plugin);
  const service = harness.getEntityService();
  for (const [id, words, visibility, status] of [
    ["tide", 120, "public", "published"],
    ["ebb", 40, "public", "published"],
    ["draft", 300, "restricted", "draft"],
  ] as const) {
    await service.createEntity({
      entity: {
        id,
        entityType: "clip",
        content: "",
        metadata: { title: id, words, status },
        visibility,
      },
    });
  }
  return harness;
}

function run(
  harness: Harness,
  type: string,
  permission: UserPermissionLevel,
  params?: unknown,
): Promise<Record<string, unknown>> {
  return harness.getMockShell().getAnalyticsRegistry().run({
    type,
    params,
    permission,
    entityService: harness.getEntityService(),
  });
}

describe("declared analytics reports", () => {
  it("answers system_analytics with the parsed params and typed reads", async () => {
    const harness = await install([clip, library]);
    try {
      expect(
        await run(harness, "clip-length", "admin", { minWords: 100 }),
      ).toEqual({
        visibility: "restricted",
        count: 2,
        titles: ["draft", "tide"],
      });
      expect(
        harness
          .getMockShell()
          .getAnalyticsRegistry()
          .getDefinitions()
          .map(({ type, description, minVisibility }) => ({
            type,
            description,
            minVisibility,
          })),
      ).toEqual([
        {
          type: "clip-length",
          description: "How long the clipped passages are.",
          minVisibility: undefined,
        },
        {
          type: "clip-audit",
          description: "Every clip, for the operator.",
          minVisibility: "admin",
        },
      ]);
    } finally {
      await harness.reset();
    }
  });

  it("reads at the caller's visibility; a public caller, published only", async () => {
    const harness = await install([clip, library]);
    try {
      expect(await run(harness, "clip-length", "public")).toMatchObject({
        visibility: "public",
        count: 2,
      });
      expect(await run(harness, "clip-length", "admin")).toMatchObject({
        visibility: "restricted",
        count: 3,
      });
    } finally {
      await harness.reset();
    }
  });

  it("keeps its floor and refuses params its schema refuses", async () => {
    const harness = await install([clip, library]);
    try {
      expect(await run(harness, "clip-audit", "admin")).toEqual({ total: 3 });
      const refused = await run(harness, "clip-audit", "trusted").catch(
        (error: unknown) => error,
      );
      expect(String(refused)).toContain("answers admin callers only");
      const invalid = await run(harness, "clip-length", "admin", {
        minWords: -1,
      }).catch((error: unknown) => error);
      expect(String(invalid)).toContain("Invalid params for clip-length");
    } finally {
      await harness.reset();
    }
  });

  it("refuses a report type that is not kebab-case", () => {
    expect(() =>
      defineEntityAnalyticsReport({
        type: "Clip Length",
        description: "Bad id.",
        params: z.object({}),
        report: async () => ({}),
      }),
    ).toThrow();
  });
});

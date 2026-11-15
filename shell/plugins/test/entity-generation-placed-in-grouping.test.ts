import { describe, expect, it } from "bun:test";
import type {
  EntityGrouping,
  EntityGroupingCatalog,
} from "@brains/entity-service";
import {
  createMockProgressReporter,
  createSilentLogger,
} from "@brains/test-utils";
import { readMarkdownFrontmatter } from "@brains/utils/markdown-frontmatter";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import { queuedByPackage } from "../src/test/package-job-data";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * A generation of a type that must belong somewhere is placed in a grouping
 * when it states none itself: the brain chooses one grouping and one value,
 * from the values a closed grouping allows or the values an open one
 * already holds, and what it wrote is saved with that membership.
 */

type Harness = ReturnType<typeof createPluginHarness>;

const briefInput = z.object({
  prompt: z.string().optional(),
  placed: z.boolean().optional(),
});

const brief = defineEntity({
  type: "brief",
  purpose: "A worked-out entry that belongs somewhere.",
  metadata: z.object({ title: z.string(), status: z.string().optional() }),
  config: { requiresGroupingMembership: true },
  generation: {
    input: briefInput,
    generate: async ({ input }) => ({
      success: true,
      id: "brief",
      content: input.placed
        ? "---\nclients:\n  - Acme\n---\nWorked out."
        : "Worked out.",
      metadata: { title: "Lighthouse budget" },
    }),
  },
});

const memo = defineEntity({
  type: "memo",
  purpose: "An entry that may float free.",
  metadata: z.object({ title: z.string() }),
  generation: {
    input: briefInput,
    generate: async () => ({
      success: true,
      id: "memo",
      content: "Jotted.",
      metadata: { title: "A memo" },
    }),
  },
});

// A closed grouping: its values are the ones it allows.
const projects: EntityGrouping = {
  key: "projects",
  label: "Projects",
  field: "projects",
  types: ["brief", "memo"],
  multiple: false,
  values: ["Lighthouse", "Harbour"],
};
// An open grouping: any value, with the ones already in use on offer.
const clients: EntityGrouping = {
  key: "clients",
  label: "Clients",
  field: "clients",
  types: ["brief"],
};

interface Asked {
  prompt: string;
}

async function install(
  groupings: readonly EntityGrouping[],
  choice: unknown,
): Promise<{ harness: Harness; asked: Asked[]; catalogs: unknown[] }> {
  const harness = createPluginHarness({
    logger: createSilentLogger("entity-generation-placed"),
  });
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "briefs", entities: [brief, memo] }),
    {},
    { name: "@fixture/briefs", version: "0.1.0" },
  )) {
    await harness.installPlugin(plugin);
  }
  const shell = harness.getMockShell();
  harness.getEntityRegistry().getGroupings = (): EntityGrouping[] => [
    ...groupings,
  ];
  const asked: Asked[] = [];
  shell.generateObject = async <T>(
    prompt: string,
    schema: { parse(input: unknown): T },
  ): Promise<{ object: T }> => {
    asked.push({ prompt });
    return { object: schema.parse(choice) };
  };
  const catalogs: unknown[] = [];
  harness.getEntityService().queryGroupingCatalog = async (
    request,
  ): Promise<EntityGroupingCatalog> => {
    catalogs.push(request);
    return {
      values: [
        { value: "Acme", count: 4 },
        { value: "Beta", count: 1 },
      ],
      total: 2,
    };
  };
  // What the generation hands the entity store, as written: the document
  // the store then keeps the grouping fields of.
  const service = harness.getEntityService();
  const create = service.createEntity.bind(service);
  const written = new Map<string, Written>();
  handed.set(harness, written);
  service.createEntity = async (request): ReturnType<typeof create> => {
    written.set(`${request.entity.entityType}/${request.entity.id}`, {
      content: request.entity.content,
    });
    return create(request);
  };
  return { harness, asked, catalogs };
}

interface Written {
  content: string;
}

/** The documents each harness's generations handed its entity store. */
const handed = new WeakMap<Harness, Map<string, Written>>();

async function generate(
  harness: Harness,
  entityType: string,
  input: z.input<typeof briefInput> = {},
): Promise<unknown> {
  const handler = harness
    .getMockShell()
    .getJobQueueService()
    .getHandler(`${entityType}:generation`);
  if (!handler) throw new Error(`No generation for ${entityType}`);
  const parsed = handler.validateAndParse(
    queuedByPackage("@fixture/briefs", input),
  );
  if (parsed === null) throw new Error("Job data refused");
  return handler.process(
    parsed,
    "job-under-test",
    createMockProgressReporter(),
    new AbortController().signal,
  );
}

async function stored(
  harness: Harness,
  entityType: string,
  id: string,
): Promise<Written | null> {
  return handed.get(harness)?.get(`${entityType}/${id}`) ?? null;
}

function frontmatterOf(entity: Written | null): unknown {
  return entity ? readMarkdownFrontmatter(entity.content).data : undefined;
}

describe("a generation of a type that must belong somewhere", () => {
  it("is saved in the grouping and value the brain chooses", async () => {
    const { harness, asked } = await install([projects, clients], {
      grouping: "projects",
      value: "Lighthouse",
    });

    expect(await generate(harness, "brief")).toMatchObject({ success: true });

    const saved = await stored(harness, "brief", "brief");
    expect(frontmatterOf(saved)).toMatchObject({ projects: ["Lighthouse"] });
    expect(saved?.content).toContain("Worked out.");
    expect(asked).toHaveLength(1);
  });

  it("offers what a closed grouping allows and what an open one holds, with what was written", async () => {
    const { harness, asked, catalogs } = await install([projects, clients], {
      grouping: "clients",
      value: "Acme",
    });

    await generate(harness, "brief", { prompt: "File it under Acme" });

    const prompt = asked[0]?.prompt ?? "";
    expect(prompt).toContain(
      'projects ("Projects"): choose one of "Lighthouse", "Harbour"',
    );
    expect(prompt).toContain(
      'clients ("Clients"): choose a value in use ("Acme", "Beta") or state a new one',
    );
    expect(prompt).toContain("Lighthouse budget");
    expect(prompt).toContain("Worked out.");
    expect(prompt).toContain("File it under Acme");
    // Only the open grouping's values are looked up.
    expect(catalogs).toEqual([
      expect.objectContaining({ grouping: "clients", entityTypes: ["brief"] }),
    ]);
    expect(
      frontmatterOf(await stored(harness, "brief", "brief")),
    ).toMatchObject({ clients: ["Acme"] });
  });

  it("takes a new value for an open grouping", async () => {
    const { harness } = await install([clients], {
      grouping: "clients",
      value: "  Gamma  ",
    });

    expect(await generate(harness, "brief")).toMatchObject({ success: true });

    expect(
      frontmatterOf(await stored(harness, "brief", "brief")),
    ).toMatchObject({ clients: ["Gamma"] });
  });

  it.each([
    [
      "a value a closed grouping does not allow",
      { grouping: "projects", value: "Tides" },
    ],
    [
      "a grouping that does not apply",
      { grouping: "areas", value: "Research" },
    ],
    ["a blank value", { grouping: "clients", value: "   " }],
  ])(
    "fails and writes nothing when the brain chooses %s",
    async (_case, choice) => {
      const { harness } = await install([projects, clients], choice);

      expect(await generate(harness, "brief")).toMatchObject({
        success: false,
        error: expect.stringContaining("could not be placed in a grouping"),
      });

      expect(await stored(harness, "brief", "brief")).toBeNull();
    },
  );

  it("keeps the membership its generation states, and asks nothing", async () => {
    const { harness, asked } = await install([projects, clients], {});

    expect(await generate(harness, "brief", { placed: true })).toMatchObject({
      success: true,
    });

    expect(
      frontmatterOf(await stored(harness, "brief", "brief")),
    ).toMatchObject({ clients: ["Acme"] });
    expect(asked).toEqual([]);
  });

  it("asks nothing where no grouping applies to the type", async () => {
    const { harness, asked } = await install([], {});

    expect(await generate(harness, "brief")).toMatchObject({ success: true });

    expect((await stored(harness, "brief", "brief"))?.content).toBe(
      "Worked out.",
    );
    expect(asked).toEqual([]);
  });
});

describe("a generation of a type that may float free", () => {
  it("is saved as written, in no grouping", async () => {
    const { harness, asked } = await install([projects], {});

    expect(await generate(harness, "memo")).toMatchObject({ success: true });

    expect((await stored(harness, "memo", "memo"))?.content).toBe("Jotted.");
    expect(asked).toEqual([]);
  });
});

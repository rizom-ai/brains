import { describe, expect, it } from "bun:test";
import type { BaseEntity, EntityGrouping } from "@brains/entity-service";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  type AnyEntityDefinition,
} from "../src";

/**
 * A type that requires a grouping membership is held to it wherever a
 * grouping applies to the type: a record must belong to at least one value
 * of one of them. A brain with no grouping for the type asks nothing more.
 */

const brief = defineEntity({
  type: "brief",
  purpose: "A worked-out entry that belongs somewhere.",
  metadata: z.object({ title: z.string(), status: z.string().optional() }),
  config: { requiresGroupingMembership: true },
});

const memo = defineEntity({
  type: "memo",
  purpose: "An entry that may float free.",
  metadata: z.object({ title: z.string() }),
});

const projects: EntityGrouping = {
  key: "projects",
  label: "Projects",
  field: "projects",
  types: ["brief", "memo"],
};
const clients: EntityGrouping = {
  key: "clients",
  label: "Clients",
  field: "clients",
  types: ["brief"],
};
// A grouping the type takes no part in.
const areas: EntityGrouping = {
  key: "areas",
  label: "Areas",
  field: "areas",
  types: ["memo"],
};

async function install(
  entities: readonly AnyEntityDefinition[],
  groupings: readonly EntityGrouping[],
): Promise<ReturnType<typeof createPluginHarness>> {
  const harness = createPluginHarness({
    logger: createSilentLogger("entity-requires-grouping"),
  });
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "briefs", entities }),
    {},
    { name: "@fixture/briefs", version: "0.1.0" },
  )) {
    await harness.installPlugin(plugin);
  }
  harness.getEntityRegistry().getGroupings = (): EntityGrouping[] => [
    ...groupings,
  ];
  return harness;
}

function stored(entityType: string, frontmatter: string): BaseEntity {
  return {
    id: "an-entry",
    entityType,
    content: `---\ntitle: An entry\n${frontmatter}---\nThe body.\n`,
    contentHash: "hash",
    visibility: "public",
    created: "2026-11-15T10:00:00.000Z",
    updated: "2026-11-15T10:00:00.000Z",
    metadata: { title: "An entry" },
  };
}

async function check(
  harness: ReturnType<typeof createPluginHarness>,
  entity: BaseEntity,
): Promise<void> {
  const validator = harness
    .getEntityRegistry()
    .getPersistValidator(entity.entityType);
  if (!validator) throw new Error(`No persist check for ${entity.entityType}`);
  await validator(entity, { operation: "create" });
}

describe("a type that requires a grouping membership", () => {
  it("is refused without one where a grouping applies, naming the groupings", async () => {
    const harness = await install([brief], [projects, clients, areas]);

    expect(check(harness, stored("brief", ""))).rejects.toThrow(
      "A brief belongs to at least one of: Projects, Clients.",
    );
  });

  it.each([
    ["an empty list", "projects: []\n"],
    ["a blank value", 'projects: ["  "]\n'],
    ["a grouping the type takes no part in", "areas: [Research]\n"],
  ])("is refused with %s", async (_case, frontmatter) => {
    const harness = await install([brief], [projects, clients, areas]);

    expect(check(harness, stored("brief", frontmatter))).rejects.toThrow(
      "A brief belongs to at least one of",
    );
  });

  it.each([
    ["one grouping", "projects: [Lighthouse]\n"],
    ["another grouping", "clients: [Acme, Beta]\n"],
  ])("is saved with a value in %s", async (_case, frontmatter) => {
    const harness = await install([brief], [projects, clients, areas]);

    expect(await check(harness, stored("brief", frontmatter))).toBeUndefined();
  });

  it("asks nothing more of a brain with no grouping for the type", async () => {
    const none = await install([brief], []);
    const others = await install([brief], [areas]);

    expect(await check(none, stored("brief", ""))).toBeUndefined();
    expect(await check(others, stored("brief", ""))).toBeUndefined();
  });

  // A queued generation's placeholder has no content to place yet, and one
  // whose generation failed never will.
  it.each(["generating", "failed"])(
    "lets a %s placeholder go without one",
    async (status) => {
      const harness = await install([brief], [projects]);

      expect(
        await check(harness, stored("brief", `status: ${status}\n`)),
      ).toBeUndefined();
      // As a create hands it over: the body, with its status in metadata.
      expect(
        await check(harness, {
          ...stored("brief", ""),
          content: "",
          metadata: { title: "An entry", status },
        }),
      ).toBeUndefined();
    },
  );
});

describe("a type that does not require a grouping membership", () => {
  it("has no such check", async () => {
    const harness = await install([memo], [projects, areas]);

    expect(
      harness.getEntityRegistry().getPersistValidator("memo"),
    ).toBeUndefined();
  });
});

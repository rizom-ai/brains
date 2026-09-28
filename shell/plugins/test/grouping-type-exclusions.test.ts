import { expect, test } from "bun:test";
import type { EntityGrouping } from "@brains/entity-service";
import { parseMarkdown } from "@brains/utils/markdown-frontmatter";
import { GroupingDefinitionSource } from "../src/internal/document-grouping-source";
import { groupingDefinitionSchema } from "../src/internal/grouping-source-contract";

test("groupings include every contributor by default and honor explicit exclusions", async () => {
  let types = ["note", "post"];
  let definition: { label: string; multiple: boolean; excludeTypes: string[] } =
    {
      label: "Clients",
      multiple: true,
      excludeTypes: [],
    };
  let installed: readonly EntityGrouping[] = [];
  const source = new GroupingDefinitionSource({
    entityType: "grouping-definitions",
    decode: (content): unknown =>
      parseMarkdown(content, { cache: false }).frontmatter["groupings"],
    getContributorTypes: (): string[] => types,
    read: async (): Promise<{ content: string; contentHash: string }> => ({
      content: `---\ngroupings: ${JSON.stringify({ clients: definition })}\n---\n`,
      contentHash: "same",
    }),
    validate: (): void => {},
    replace: (next): void => {
      installed = next;
    },
  });
  await source.ensureCurrent();
  expect(installed[0]?.types).toEqual(["note", "post"]);
  definition = { ...definition, excludeTypes: ["post", "future"] };
  await source.ensureCurrent();
  expect(installed[0]?.types).toEqual(["note"]);
  types = ["note", "post", "link", "future"];
  await source.ensureCurrent();
  expect(installed[0]?.types).toEqual(["link", "note"]);
  expect(source.getSnapshot().groupings["clients"]?.excludeTypes).toEqual([
    "post",
    "future",
  ]);
  definition = { ...definition, excludeTypes: [...types] };
  await source.ensureCurrent();
  expect(installed).toEqual([]);
  expect(source.getSnapshot().groupings["clients"]).toEqual(definition);
  definition = { ...definition, excludeTypes: [] };
  await source.ensureCurrent();
  expect(installed[0]?.types).toEqual(["future", "link", "note", "post"]);
});

test("no type configuration is required; exclusions must be exact unique nonempty names", () => {
  const definition = { label: "Clients", multiple: true };
  expect(groupingDefinitionSchema.parse(definition)).toEqual(definition);
  expect(
    groupingDefinitionSchema.safeParse({ ...definition, excludeTypes: [""] })
      .success,
  ).toBe(false);
  expect(
    groupingDefinitionSchema.safeParse({
      ...definition,
      excludeTypes: ["post", "post"],
    }).success,
  ).toBe(false);
  expect(
    groupingDefinitionSchema.safeParse({ ...definition, types: ["note"] })
      .success,
  ).toBe(false);
});

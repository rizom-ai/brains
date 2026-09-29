import { expect, test } from "bun:test";
import type { EntityGrouping } from "@brains/plugins";
import { GroupingDefinitionSource } from "../src/grouping-definition-source";
import { groupingDefinitionSchema } from "../src/grouping-definitions-contract";

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

test("repairable invalid sections retain authored exclusion names for system-option filtering", async () => {
  const source = new GroupingDefinitionSource({
    getContributorTypes: (): string[] => ["note"],
    read: async (): Promise<{ content: string; contentHash: string }> => ({
      content:
        "---\ngroupings:\n  clients:\n    label: Clients\n    multiple: true\n    values: []\n    excludeTypes: [prompt, future, prompt]\n---\n",
      contentHash: "invalid",
    }),
    validate: (): void => {},
    replace: (): void => {},
  });
  await source.ensureCurrent();
  expect(source.getSnapshot().groupings).toEqual({});
  expect(source.getSnapshot().issues.length).toBeGreaterThan(0);
  expect(source.getSnapshot().excludedTypes).toEqual(["prompt", "future"]);
  source.getSnapshot().excludedTypes.push("not-authored");
  expect(source.getSnapshot().excludedTypes).toEqual(["prompt", "future"]);
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

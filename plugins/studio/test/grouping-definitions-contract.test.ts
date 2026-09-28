import { describe, expect, test } from "bun:test";
import { readGroupingDefinitions } from "../src/entity/grouping-definitions";
import { createMockShell } from "@brains/plugins/test";
import { instantiate } from "./helpers/install";
import { groupingDefinitionsFrontmatterSchema } from "../src/grouping-definitions-contract";
const areas = { label: "Areas", types: ["note"], multiple: true };

function document(groupings: unknown): string {
  return `---\nvisibility: shared\ngroupings: ${JSON.stringify(groupings)}\n---\n`;
}

describe("grouping definitions contract", () => {
  test("requires cardinality independently of an optional list", () => {
    expect(
      groupingDefinitionsFrontmatterSchema.parse({ groupings: { areas } }),
    ).toEqual({ groupings: { areas } });
    expect(
      groupingDefinitionsFrontmatterSchema.safeParse({
        groupings: { areas: { label: "Areas", types: ["note"] } },
      }).success,
    ).toBe(false);
    expect(
      groupingDefinitionsFrontmatterSchema.safeParse({
        groupings: { areas: { ...areas, values: [] } },
      }).success,
    ).toBe(false);
    expect(
      groupingDefinitionsFrontmatterSchema.safeParse({
        groupings: { areas: { ...areas, values: ["", ""] } },
      }).success,
    ).toBe(false);
    expect(
      groupingDefinitionsFrontmatterSchema.safeParse({
        groupings: { areas: { ...areas, values: ["Acme", "Acme"] } },
      }).success,
    ).toBe(false);
    expect(
      groupingDefinitionsFrontmatterSchema.safeParse({
        groupings: { areas: { ...areas, field: "different" } },
      }).success,
    ).toBe(false);
  });
  test("preserves exact values and refuses more than twenty definitions", () => {
    const definitions = {
      areas: { ...areas, values: [" Acme, Inc. ", "Acme", "acme"] },
    };
    expect(readGroupingDefinitions(document(definitions))).toEqual({
      groupings: definitions,
    });
    expect(
      groupingDefinitionsFrontmatterSchema.safeParse({
        groupings: Object.fromEntries(
          Array.from({ length: 21 }, (_, index) => [`group-${index}`, areas]),
        ),
      }).success,
    ).toBe(false);
  });
  test("keeps even malformed stored documents reconstructable for repair", async () => {
    const shell = createMockShell();
    const plugin = instantiate();
    await plugin.register(shell);
    try {
      await plugin.finalizeRegistration?.();
      const adapter = shell
        .getEntityRegistry()
        .getAdapter("grouping-definitions");
      const content = "---\ngroupings: [broken\n---\n";
      expect(adapter.fromMarkdown(content)).toMatchObject({
        content,
        metadata: {},
      });
      expect(() => readGroupingDefinitions(content)).toThrow();
      expect(adapter.hasBody).toBe(false);
      expect(adapter.isSingleton).toBe(true);
      const refused = await shell
        .getEntityService()
        .createEntityFromMarkdown({
          input: {
            entityType: "grouping-definitions",
            id: "wrong",
            markdown: document({}),
            visibility: "shared",
          },
        })
        .catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(Error);
      expect(
        await shell.getEntityService().getEntityRaw({
          entityType: "grouping-definitions",
          id: "wrong",
          visibilityScope: "shared",
        }),
      ).toBeNull();
    } finally {
      await plugin.shutdown?.();
    }
  });
});

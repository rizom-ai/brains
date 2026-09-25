import { describe, expect, test } from "bun:test";
import type { BaseEntity } from "@brains/plugins";

import { GroupingDefinitionSource } from "../src/grouping-definition-source";
import { groupingDefinitionsAdapter } from "../src/entity/grouping-definitions";
import { groupingDefinitionsFrontmatterSchema } from "../src/grouping-definitions-contract";

type DefinitionRow = Pick<BaseEntity, "content" | "contentHash">;
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
    expect(groupingDefinitionsAdapter.read(document(definitions))).toEqual({
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
  test("keeps even malformed stored documents reconstructable for repair", () => {
    const content = "---\ngroupings: [broken\n---\n";
    expect(groupingDefinitionsAdapter.fromMarkdown(content)).toMatchObject({
      id: "grouping-definitions",
      content,
      metadata: {},
    });
    expect(() => groupingDefinitionsAdapter.read(content)).toThrow();
    expect(() => groupingDefinitionsAdapter.read(content)).toThrow();
    expect(groupingDefinitionsAdapter.hasBody).toBe(false);
    expect(groupingDefinitionsAdapter.isSingleton).toBe(true);
  });
});

describe("definition source snapshots", () => {
  test("reuses a content revision, publishes removals and cannot be changed through a returned snapshot", async () => {
    let content: string | undefined = document({ areas });
    let reads = 0;
    const replacements: unknown[] = [];
    const source = new GroupingDefinitionSource({
      read: async (): Promise<DefinitionRow | null> => {
        reads++;
        return content === undefined ? null : { content, contentHash: content };
      },
      validate: (): void => {},
      replace: (next): void => {
        replacements.push(next);
      },
    });
    await source.ensureCurrent();
    await source.ensureCurrent();
    expect(reads).toBe(2);
    expect(replacements).toEqual([
      [{ key: "areas", field: "areas", label: "Areas", types: ["note"] }],
    ]);
    const snapshot = source.getSnapshot();
    snapshot.groupings["areas"]?.types.push("post");
    expect(source.getSnapshot().groupings["areas"]?.types).toEqual(["note"]);
    content = undefined;
    await source.ensureCurrent();
    expect(replacements).toHaveLength(2);
    expect(replacements[1]).toEqual([]);
    expect(source.getSnapshot().groupings).toEqual({});
  });
  test("drops only invalid entries and explains them without changing valid labels", async () => {
    const source = new GroupingDefinitionSource({
      read: async (): Promise<DefinitionRow> => ({
        content: document({
          areas,
          broken: { ...areas, types: ["missing"] },
          invalid: { ...areas, multiple: "yes" },
        }),
        contentHash: "one",
      }),
      validate: (next): void => {
        if (next.some((entry) => entry.types.includes("missing")))
          throw new Error("Unknown type: missing");
      },
      replace: (): void => {},
    });
    await source.ensureCurrent();
    expect(source.getSnapshot().groupings).toEqual({ areas });
    expect(source.getSnapshot().issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["groupings", "broken"],
          message: "Unknown type: missing",
        }),
        expect.objectContaining({ path: ["groupings", "invalid", "multiple"] }),
      ]),
    );
  });
  test("malformed YAML clears stale definitions but a transport failure preserves them and rejects the operation", async () => {
    let content = document({ areas });
    let unavailable = false;
    const source = new GroupingDefinitionSource({
      read: async (): Promise<DefinitionRow> => {
        if (unavailable) throw new Error("Database unavailable");
        return { content, contentHash: content };
      },
      validate: (): void => {},
      replace: (): void => {},
    });
    await source.ensureCurrent();
    unavailable = true;
    const failure = await source
      .ensureCurrent()
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({ message: "Database unavailable" });
    expect(source.getSnapshot().groupings).toEqual({ areas });
    unavailable = false;
    content = "---\ngroupings: [broken\n---\n";
    await source.ensureCurrent();
    expect(source.getSnapshot().groupings).toEqual({});
    expect(source.getSnapshot().issues).toHaveLength(1);
  });
  test("retries failed publication without exposing a partial snapshot", async () => {
    const row = { content: document({ areas }), contentHash: "one" };
    let fail = true;
    let replacements = 0;
    const source = new GroupingDefinitionSource({
      read: async (): Promise<DefinitionRow> => row,
      validate: (): void => {},
      replace: (): void => {
        replacements++;
        if (fail) throw new Error("Registry unavailable");
      },
    });
    expect(
      await source.ensureCurrent().catch((error: unknown) => error),
    ).toMatchObject({ message: "Registry unavailable" });
    expect(source.getSnapshot().groupings).toEqual({});
    fail = false;
    await source.ensureCurrent();
    expect(source.getSnapshot().groupings).toEqual({ areas });
    expect(replacements).toBe(2);
    row.content = document({}); // Same row object and even the same stored hash.
    await source.ensureCurrent();
    expect(source.getSnapshot().groupings).toEqual({});
  });
  test.each([null, [], "invalid"])(
    "reports an invalid stored grouping mapping: %j",
    async (groupings) => {
      const source = new GroupingDefinitionSource({
        read: async (): Promise<DefinitionRow> => ({
          content: document(groupings),
          contentHash: "one",
        }),
        validate: (): void => {},
        replace: (): void => {},
      });
      await source.ensureCurrent();
      expect(source.getSnapshot().groupings).toEqual({});
      expect(source.getSnapshot().issues).toEqual([
        expect.objectContaining({ path: ["groupings"] }),
      ]);
    },
  );
  test("existing timestamps detect identical source restored between reads, while local saves retain delta scans", async () => {
    const row = {
      content: document({ areas }),
      contentHash: "same",
      updated: "first",
    };
    const rescans: Array<boolean | undefined> = [];
    const source = new GroupingDefinitionSource({
      read: async (): Promise<typeof row> => row,
      validate: (): void => {},
      replace: (_groupings, options): void => {
        rescans.push(options?.reprojectExisting);
      },
    });
    await source.ensureCurrent();
    row.updated = "restored";
    await source.ensureCurrent();
    expect(rescans).toEqual([true, true]);
    await source.ensureCurrent();
    expect(rescans).toHaveLength(2);
    row.updated = "local edit";
    row.content = document({ areas: { ...areas, label: "Research" } });
    await source.ensureCurrent({ afterWrite: true });
    expect(rescans).toEqual([true, true, false]);
  });

  test("serializes overlapping refreshes so an old read cannot overwrite a newer revision", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reads = 0;
    const source = new GroupingDefinitionSource({
      read: async (): Promise<DefinitionRow> => {
        reads++;
        if (reads === 1) {
          await gate;
          return { content: document({ areas }), contentHash: "old" };
        }
        return { content: document({}), contentHash: "new" };
      },
      validate: (): void => {},
      replace: (): void => {},
    });
    const first = source.ensureCurrent();
    const second = source.ensureCurrent();
    release?.();
    await Promise.all([first, second]);
    expect(reads).toBe(2);
    expect(source.getSnapshot().groupings).toEqual({});
  });
});

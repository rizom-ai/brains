import { describe, expect, test } from "bun:test";
import type { BaseEntity } from "@brains/entity-service";
import { parseMarkdown } from "@brains/utils/markdown-frontmatter";
import { GroupingDefinitionSource } from "../src/internal/document-grouping-source";
type DefinitionRow = Pick<BaseEntity, "content" | "contentHash">;
const sourceConfig = {
  entityType: "grouping-definitions",
  getContributorTypes: (): string[] => ["note", "post"],
  decode: (content: string): unknown => {
    const value = parseMarkdown(content, { cache: false }).frontmatter[
      "groupings"
    ];
    return value === undefined ? {} : value;
  },
};
const areas = { label: "Areas", excludeTypes: ["post"], multiple: true };

function document(groupings: unknown): string {
  return `---\nvisibility: shared\ngroupings: ${JSON.stringify(groupings)}\n---\n`;
}

describe("definition source snapshots", () => {
  test("refreshes unchanged documents when eligible contributors change and retains fully excluded definitions", async () => {
    let contributors = ["note", "grouping-definitions"];
    const groupings = {
      areas: { label: "Areas", multiple: true, excludeTypes: ["post"] },
    };
    const replacements: unknown[] = [];
    const source = new GroupingDefinitionSource({
      ...sourceConfig,
      getContributorTypes: (): string[] => contributors,
      read: async (): Promise<DefinitionRow> => ({
        content: document(groupings),
        contentHash: "unchanged",
      }),
      validate: (): void => {},
      replace: (next): void => {
        replacements.push(next);
      },
    });
    await source.ensureCurrent();
    contributors = ["post", "note", "link", "grouping-definitions"];
    await source.ensureCurrent();
    expect(replacements).toEqual([
      [{ key: "areas", field: "areas", label: "Areas", types: ["note"] }],
      [
        {
          key: "areas",
          field: "areas",
          label: "Areas",
          types: ["link", "note"],
        },
      ],
    ]);
    contributors = ["post"];
    await source.ensureCurrent();
    expect(replacements[2]).toEqual([]);
    expect(source.getSnapshot()).toEqual({ groupings, issues: [] });
  });
  test("reuses a content revision, publishes removals and cannot be changed through a returned snapshot", async () => {
    let content: string | undefined = document({ areas });
    let reads = 0;
    const replacements: unknown[] = [];
    const source = new GroupingDefinitionSource({
      ...sourceConfig,
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
    snapshot.groupings["areas"]?.excludeTypes?.push("note");
    expect(source.getSnapshot().groupings["areas"]?.excludeTypes).toEqual([
      "post",
    ]);
    content = undefined;
    await source.ensureCurrent();
    expect(replacements).toHaveLength(2);
    expect(replacements[1]).toEqual([]);
    expect(source.getSnapshot().groupings).toEqual({});
  });
  test("drops only invalid entries and explains them without changing valid labels", async () => {
    const source = new GroupingDefinitionSource({
      ...sourceConfig,
      read: async (): Promise<DefinitionRow> => ({
        content: document({
          areas,
          broken: { ...areas },
          invalid: { ...areas, multiple: "yes" },
          control: { ...areas, types: ["note", "grouping-definitions"] },
        }),
        contentHash: "one",
      }),
      validate: (next): void => {
        if (next.some((entry) => entry.key === "broken"))
          throw new Error("Reserved grouping key");
      },
      replace: (): void => {},
    });
    await source.ensureCurrent();
    expect(source.getSnapshot().groupings).toEqual({ areas });
    expect(source.getSnapshot().issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["groupings", "broken"],
          message: "Reserved grouping key",
        }),
        expect.objectContaining({ path: ["groupings", "invalid", "multiple"] }),
        expect.objectContaining({
          path: ["groupings", "control"],
          message: expect.stringContaining("types"),
        }),
      ]),
    );
  });
  test("malformed YAML clears stale definitions but a transport failure preserves them and rejects the operation", async () => {
    let content = document({ areas });
    let unavailable = false;
    const source = new GroupingDefinitionSource({
      ...sourceConfig,
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
      ...sourceConfig,
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
        ...sourceConfig,
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
      ...sourceConfig,
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
      ...sourceConfig,
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

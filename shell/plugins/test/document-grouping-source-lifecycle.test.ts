import { expect, test } from "bun:test";
import { GroupingDefinitionSource } from "../src/internal/document-grouping-source";

test("shutdown fences an in-flight source read and future refreshes", async () => {
  const controller = new AbortController();
  const started = Promise.withResolvers<void>();
  const row = Promise.withResolvers<{ content: string; contentHash: string }>();
  let reads = 0;
  let replacements = 0;
  const source = new GroupingDefinitionSource({
    entityType: "policy",
    getContributorTypes: (): string[] => ["note"],
    signal: controller.signal,
    decode: (content): unknown => JSON.parse(content),
    read: async (): Promise<{ content: string; contentHash: string }> => {
      reads++;
      started.resolve();
      return row.promise;
    },
    validate: (): void => {},
    replace: (): void => {
      replacements++;
    },
  });
  const pending = source.ensureCurrent().catch((error: unknown) => error);
  await started.promise;
  const reason = new Error("Owner stopped");
  controller.abort(reason);
  row.resolve({
    contentHash: "old",
    content: JSON.stringify({
      areas: { label: "Areas", multiple: true },
    }),
  });
  expect(await pending).toBe(reason);
  expect(await source.ensureCurrent().catch((error: unknown) => error)).toBe(
    reason,
  );
  expect(reads).toBe(1);
  expect(replacements).toBe(0);
  expect(source.getSnapshot()).toEqual({ groupings: {}, issues: [] });
});

test("runtime bounds decoded policies and rejects retired type allowlists", () => {
  const source = new GroupingDefinitionSource({
    entityType: "policy",
    getContributorTypes: (): string[] => ["note", "policy"],
    decode: (content): unknown => JSON.parse(content),
    read: async (): Promise<null> => null,
    validate: (): void => {},
    replace: (): void => {},
  });
  const definition = { label: "Areas", multiple: true };
  const snapshot = source.validateDefinitions({
    valid: definition,
    recursive: { ...definition, types: ["policy"] },
    oversized: {
      ...definition,
      values: Array.from({ length: 101 }, (_, index) => `${index}`),
    },
  });
  expect(Object.keys(snapshot.groupings)).toEqual(["valid"]);
  expect(snapshot.issues.map((issue) => issue.path)).toEqual([
    ["groupings", "recursive"],
    ["groupings", "oversized", "values"],
  ]);
});

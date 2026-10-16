import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fromYaml } from "@brains/utils/yaml";
import { isRecord } from "@brains/utils/is-record";

const testCasesDirectory = join(import.meta.dir, "..", "test-cases");
const LEGACY_ROOTS = new Set(["fields", "content", "edits", "source"]);

function yamlFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? yamlFiles(join(directory, entry.name))
      : entry.name.endsWith(".yaml")
        ? [join(directory, entry.name)]
        : [],
  );
}

function updateExpectations(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(updateExpectations);
  if (!isRecord(value)) return [];
  return [
    ...(value["toolName"] === "system_update" ? [value] : []),
    ...Object.values(value).flatMap(updateExpectations),
  ];
}

function argPaths(expectation: Record<string, unknown>): string[] {
  const absent = expectation["argsAbsent"];
  return [
    ...["args", "argsContain"].flatMap((key) => {
      const args = expectation[key];
      return isRecord(args) ? Object.keys(args) : [];
    }),
    ...(Array.isArray(absent)
      ? absent.filter((path) => typeof path === "string")
      : []),
  ];
}

describe("system_update eval expectations", () => {
  test("address the typed operation, never the removed flat arguments", () => {
    const legacy = yamlFiles(testCasesDirectory).flatMap((file) =>
      updateExpectations(fromYaml(readFileSync(file, "utf8")))
        .flatMap(argPaths)
        .filter((path) => LEGACY_ROOTS.has(path.split(".")[0] ?? ""))
        .map((path) => `${relative(testCasesDirectory, file)}: ${path}`),
    );
    expect(legacy).toEqual([]);
  });
});

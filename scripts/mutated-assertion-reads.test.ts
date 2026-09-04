import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  destructuresReplacedField,
  matchesLiteral,
  readsInLaterTest,
  readsReplacedField,
} from "./mutated-assertion-reads.fixtures";
import {
  findMutatedAssertionReads,
  findMutatedAssertionReadsInSource,
} from "./mutated-assertion-reads";

const repositoryRoot = join(import.meta.dir, "..");

describe("mutated assertion reads", () => {
  test("flags a field read back after an asymmetric matcher replaced it", () => {
    expect(
      findMutatedAssertionReadsInSource("example.test.ts", readsReplacedField),
    ).toEqual([
      {
        file: "example.test.ts",
        matchLine: 4,
        received: "options",
        key: "challenge",
        readLine: 5,
      },
    ]);
  });

  test("flags a destructured read", () => {
    const found = findMutatedAssertionReadsInSource(
      "example.test.ts",
      destructuresReplacedField,
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.key).toBe("token");
  });

  test("ignores a literal match, which does not mutate", () => {
    expect(
      findMutatedAssertionReadsInSource("example.test.ts", matchesLiteral),
    ).toEqual([]);
  });

  test("ignores a read in a later test, which gets a fresh object", () => {
    expect(
      findMutatedAssertionReadsInSource("example.test.ts", readsInLaterTest),
    ).toEqual([]);
  });

  test("no test in the repository reads a field a matcher replaced", async () => {
    const found = await findMutatedAssertionReads(repositoryRoot);

    expect(
      found.map(
        (read) =>
          `${read.file}:${read.matchLine} ${read.received}.${read.key} ` +
          `read again at line ${read.readLine}`,
      ),
    ).toEqual([]);
  });
});

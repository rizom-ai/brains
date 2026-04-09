import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseInstanceOverrides } from "../src/instance-overrides";

function readOverrides(
  relativePath: string,
): ReturnType<typeof parseInstanceOverrides> {
  const yaml = readFileSync(
    join(import.meta.dir, "..", "..", "..", relativePath),
    "utf8",
  );
  return parseInstanceOverrides(yaml);
}

describe("brain.yaml site theme pairing", () => {
  test("yeehaa.io keeps the yeehaa site paired with the brutalist theme", () => {
    const overrides = readOverrides("apps/yeehaa.io/brain.yaml");

    expect(overrides.site).toEqual({
      package: "@brains/site-yeehaa",
      theme: "@brains/theme-brutalist",
    });
  });

  test("yeehaa.io deploy config keeps the yeehaa site paired with the brutalist theme", () => {
    const overrides = readOverrides("apps/yeehaa.io/deploy/brain.yaml");

    expect(overrides.site).toEqual({
      package: "@brains/site-yeehaa",
      theme: "@brains/theme-brutalist",
    });
  });
});

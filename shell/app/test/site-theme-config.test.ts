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
  test("professional-brain keeps the yeehaa site paired with the brutalist theme", () => {
    const overrides = readOverrides("apps/professional-brain/brain.yaml");

    expect(overrides.site).toEqual({
      package: "@brains/site-yeehaa",
      theme: "@brains/theme-brutalist",
    });
  });

  test("professional-brain deploy config keeps the yeehaa site paired with the brutalist theme", () => {
    const overrides = readOverrides(
      "apps/professional-brain/deploy/brain.yaml",
    );

    expect(overrides.site).toEqual({
      package: "@brains/site-yeehaa",
      theme: "@brains/theme-brutalist",
    });
  });

  test("mylittlephoney keeps the custom site paired with the pink theme", () => {
    const overrides = readOverrides("apps/mylittlephoney/brain.yaml");

    expect(overrides.site).toEqual({
      package: "@brains/site-mylittlephoney",
      theme: "@brains/theme-mylittlephoney",
    });
  });

  test("mylittlephoney deploy config keeps the custom site paired with the pink theme", () => {
    const overrides = readOverrides("apps/mylittlephoney/deploy/brain.yaml");

    expect(overrides.site).toEqual({
      package: "@brains/site-mylittlephoney",
      theme: "@brains/theme-mylittlephoney",
    });
  });
});

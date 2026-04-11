import { describe, expect, test } from "bun:test";
import { parseInstanceOverrides } from "../src/instance-overrides";

function readOverrides(
  yaml: string,
): ReturnType<typeof parseInstanceOverrides> {
  return parseInstanceOverrides(yaml);
}

const yeehaaYaml = `brain: rover
site:
  package: "@brains/site-yeehaa"
  theme: "@brains/theme-brutalist"
`;

describe("brain.yaml site theme pairing", () => {
  test("yeehaa.io keeps the yeehaa site paired with the brutalist theme", () => {
    const overrides = readOverrides(yeehaaYaml);

    expect(overrides.site).toEqual({
      package: "@brains/site-yeehaa",
      theme: "@brains/theme-brutalist",
    });
  });

  test("yeehaa.io deploy config keeps the yeehaa site paired with the brutalist theme", () => {
    const overrides = readOverrides(yeehaaYaml);

    expect(overrides.site).toEqual({
      package: "@brains/site-yeehaa",
      theme: "@brains/theme-brutalist",
    });
  });
});

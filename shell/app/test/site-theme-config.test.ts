import { describe, expect, test } from "bun:test";
import { parseInstanceOverrides } from "../src/instance-overrides";

function readOverrides(
  yaml: string,
): ReturnType<typeof parseInstanceOverrides> {
  return parseInstanceOverrides(yaml);
}

const rizomYaml = `brain: rover
site:
  package: "@brains/site-rizom"
  theme: "@brains/theme-rizom"
`;

const yeehaaYaml = `brain: rover
site:
  package: "@brains/site-yeehaa"
`;

describe("brain.yaml site theme pairing", () => {
  test("keeps explicit site and theme package refs when both are present", () => {
    const overrides = readOverrides(rizomYaml);

    expect(overrides.site).toEqual({
      package: "@brains/site-rizom",
      theme: "@brains/theme-rizom",
    });
  });

  test("allows a site package without an explicit theme package", () => {
    const overrides = readOverrides(yeehaaYaml);

    expect(overrides.site).toEqual({
      package: "@brains/site-yeehaa",
    });
  });
});

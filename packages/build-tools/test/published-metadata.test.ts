import { describe, expect, test } from "bun:test";
import { assertPublishedCompatibilityMetadata } from "../src/published-metadata";

const target = {
  name: "@example/site",
  version: "1.2.3",
  brainRange: ">=0.2.0-alpha.217 <0.3.0",
};

describe("assertPublishedCompatibilityMetadata", () => {
  test("accepts standard peer metadata", () => {
    expect(() =>
      assertPublishedCompatibilityMetadata(
        target,
        {
          peerDependencies: {
            "@rizom/brain": ">=0.2.0-alpha.217 <0.3.0",
            preact: "^10.27.2",
          },
        },
        "registry packument",
      ),
    ).not.toThrow();
  });

  test("rejects missing or mismatched brain compatibility", () => {
    expect(() =>
      assertPublishedCompatibilityMetadata(target, {}, "registry packument"),
    ).toThrow("expected");
    expect(() =>
      assertPublishedCompatibilityMetadata(
        target,
        { peerDependencies: { "@rizom/brain": ">=0.3.0" } },
        "tarball manifest",
      ),
    ).toThrow(">=0.3.0");
  });

  test("rejects authoring-only metadata", () => {
    expect(() =>
      assertPublishedCompatibilityMetadata(
        target,
        {
          peerDependencies: {
            "@rizom/brain": ">=0.2.0-alpha.217 <0.3.0",
          },
          publishPeerDependencies: {
            "@rizom/brain": ">=0.2.0-alpha.217 <0.3.0",
          },
          publishExports: { ".": "./dist/index.js" },
        },
        "registry packument",
      ),
    ).toThrow("authoring-only");
  });

  test("rejects unresolved workspace: specifiers in dependency fields", () => {
    const brainPeer = { "@rizom/brain": ">=0.2.0-alpha.217 <0.3.0" };
    for (const field of [
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
    ] as const) {
      const manifest = {
        peerDependencies: { ...brainPeer },
        [field]: { ...brainPeer, "@rizom/site": "workspace:*" },
      };
      expect(() =>
        assertPublishedCompatibilityMetadata(
          target,
          manifest,
          "registry packument",
        ),
      ).toThrow("workspace:");
    }
  });
});

import { describe, expect, it } from "bun:test";
import {
  resolveBrainPackageName,
  resolveBrainPackageRootName,
} from "../src/brain-package";

describe("brain package resolution", () => {
  it("resolves canonical aliases to the model export", () => {
    expect(resolveBrainPackageName("brain")).toBe("@rizom/brain/model");
    expect(resolveBrainPackageName("@rizom/brain")).toBe("@rizom/brain/model");
  });

  it("resolves package metadata from the scoped package root", () => {
    expect(resolveBrainPackageRootName("@rizom/brain/model")).toBe(
      "@rizom/brain",
    );
    expect(resolveBrainPackageRootName("@example/custom/model")).toBe(
      "@example/custom",
    );
    expect(resolveBrainPackageRootName("@example/custom")).toBe(
      "@example/custom",
    );
  });
});

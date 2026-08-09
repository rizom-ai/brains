import { describe, expect, it } from "bun:test";
import {
  resolveBrainPackageName,
  resolveBrainPackageRef,
} from "../src/brain-package";

describe("brain package resolution", () => {
  it("resolves canonical aliases to the model export", () => {
    expect(resolveBrainPackageName("brain")).toBe("@rizom/brain/model");
    expect(resolveBrainPackageName("@rizom/brain")).toBe("@rizom/brain/model");
  });

  it("keeps the owning package and the definition specifier together", () => {
    expect(resolveBrainPackageRef("brain")).toEqual({
      packageName: "@rizom/brain",
      specifier: "@rizom/brain/model",
    });
    expect(resolveBrainPackageRef("@example/custom/model")).toEqual({
      packageName: "@example/custom",
      specifier: "@example/custom/model",
    });
    expect(resolveBrainPackageRef("@example/custom")).toEqual({
      packageName: "@example/custom",
      specifier: "@example/custom",
    });
  });

  it("rejects unsupported definitions", () => {
    expect(() => resolveBrainPackageRef("@brains/core")).toThrow(
      /Unsupported brain definition/,
    );
    expect(() => resolveBrainPackageRef("local-brain")).toThrow(
      /Unsupported brain definition/,
    );
  });
});

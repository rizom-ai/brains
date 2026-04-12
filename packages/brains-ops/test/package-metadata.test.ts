import { describe, expect, it } from "bun:test";

import packageJson from "../package.json";

describe("@brains/ops package metadata", () => {
  it("publishes built dist entrypoints and templates", () => {
    expect(packageJson.main).toBe("./dist/index.js");
    expect(packageJson.types).toBe("./dist/index.d.ts");
    expect(packageJson.bin["brains-ops"]).toBe("./dist/brains-ops.js");
    expect(packageJson.files).toEqual(["dist", "templates"]);
    expect(packageJson.scripts.build).toBeDefined();
    expect(packageJson.scripts.prepublishOnly).toBeDefined();
  });

  it("does not publish with workspace runtime dependencies", () => {
    const dependencies = packageJson.dependencies ?? {};
    const dependencyValues = Object.values(dependencies);
    expect(
      dependencyValues.some((value) => value === "workspace:*"),
    ).toBeFalse();
    expect(Object.hasOwn(dependencies, "@brains/utils")).toBeFalse();
    expect(Object.hasOwn(dependencies, "zod")).toBeFalse();
  });
});

import { describe, expect, test } from "bun:test";
import { generateNpmPackageJson } from "../src/generate-npm-package";

describe("generateNpmPackageJson", () => {
  test("should generate package.json with correct name", () => {
    const pkg = generateNpmPackageJson("rover", "1.0.0");
    expect(pkg.name).toBe("@brains/rover");
  });

  test("should include bin entry for model name", () => {
    const pkg = generateNpmPackageJson("rover", "1.0.0");
    expect(pkg.bin["rover"]).toBe("./dist/.model-entrypoint.js");
  });

  test("should include exports", () => {
    const pkg = generateNpmPackageJson("rover", "1.0.0");
    expect(pkg.exports["."]).toBe("./dist/.model-entrypoint.js");
  });

  test("should list native deps as optionalDependencies", () => {
    const pkg = generateNpmPackageJson("rover", "1.0.0");
    expect(pkg.optionalDependencies["sharp"]).toBeDefined();
    expect(pkg.optionalDependencies["@libsql/client"]).toBeDefined();
    expect(pkg.optionalDependencies["better-sqlite3"]).toBeDefined();
  });

  test("should use correct version", () => {
    const pkg = generateNpmPackageJson("rover", "2.3.4");
    expect(pkg.version).toBe("2.3.4");
  });

  test("should work for different model names", () => {
    const pkg = generateNpmPackageJson("sentry", "1.0.0");
    expect(pkg.name).toBe("@brains/sentry");
    expect(pkg.bin["sentry"]).toBe("./dist/.model-entrypoint.js");
  });
});

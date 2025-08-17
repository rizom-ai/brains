import { describe, expect, it } from "bun:test";
import { defineConfig } from "../src/config";
import type { AppConfig } from "../src/types";
import { SystemPlugin } from "@brains/system";

describe("defineConfig", () => {
  const validConfig: AppConfig = {
    name: "test-app",
    version: "1.0.0",
    aiApiKey: "test-key",
    plugins: [new SystemPlugin({})],
  };

  it("should validate and return config", () => {
    const result = defineConfig(validConfig);

    expect(result).toEqual(validConfig);
    expect(result.name).toBe("test-app");
    expect(result.version).toBe("1.0.0");
    expect(result.plugins).toHaveLength(1);
  });

  it("should apply default values for optional fields", () => {
    const configWithoutOptionals: AppConfig = {
      name: "test-app", // required
      version: "1.0.0", // required
      plugins: [],
      // aiApiKey, logLevel, database are optional
    };

    const result = defineConfig(configWithoutOptionals);

    expect(result.name).toBe("test-app");
    expect(result.version).toBe("1.0.0");
    expect(result.plugins).toEqual([]);
    expect(result.aiApiKey).toBeUndefined();
    expect(result.logLevel).toBeUndefined();
    expect(result.database).toBeUndefined();
  });

  it("should preserve plugins array", () => {
    const configWithPlugins: AppConfig = {
      name: "test-app",
      version: "1.0.0",
      plugins: [new SystemPlugin({})],
    };

    const result = defineConfig(configWithPlugins);

    expect(result.plugins).toHaveLength(1);
    expect(result.plugins?.[0]).toBeInstanceOf(SystemPlugin);
  });
});

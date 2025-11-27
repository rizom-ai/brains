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

    // Check input values are preserved
    expect(result.name).toBe("test-app");
    expect(result.version).toBe("1.0.0");
    expect(result.aiApiKey).toBe("test-key");
    expect(result.plugins).toHaveLength(1);
    // Deployment defaults are applied
    expect(result.deployment).toBeDefined();
    expect(result.deployment?.provider).toBe("hetzner");
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

  it("should apply deployment defaults", () => {
    const result = defineConfig({
      name: "test-app",
      version: "1.0.0",
      plugins: [],
    });

    expect(result.deployment).toBeDefined();
    expect(result.deployment?.provider).toBe("hetzner");
    expect(result.deployment?.serverSize).toBe("cx33");
    expect(result.deployment?.ports?.default).toBe(3333);
    expect(result.deployment?.cdn?.enabled).toBe(false);
    expect(result.deployment?.dns?.enabled).toBe(false);
  });

  it("should merge custom deployment config with defaults", () => {
    const result = defineConfig({
      name: "my-app",
      version: "1.0.0",
      plugins: [],
      deployment: {
        domain: "example.com",
        cdn: {
          enabled: true,
          provider: "bunny",
        },
      },
    });

    // Custom values
    expect(result.deployment?.domain).toBe("example.com");
    expect(result.deployment?.cdn?.enabled).toBe(true);
    expect(result.deployment?.cdn?.provider).toBe("bunny");
    // Defaults preserved
    expect(result.deployment?.provider).toBe("hetzner");
    expect(result.deployment?.serverSize).toBe("cx33");
  });
});

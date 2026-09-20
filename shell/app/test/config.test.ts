import { describe, expect, it } from "bun:test";
import { defineConfig } from "../src/config";
import { appConfigSchema, type AppConfigInput } from "../src/types";
import {
  BrainCharacterSchema,
  pluginMetadataSchema,
  type Plugin,
  type PluginCapabilities,
} from "@brains/plugins";
import { logLevelSchema, reasoningEffortSchema } from "@brains/core";

describe("appConfigSchema", () => {
  it("validates plugins and identity with the plugin package schemas", () => {
    expect(appConfigSchema.shape.plugins.unwrap().element).toBe(
      pluginMetadataSchema,
    );
    expect(appConfigSchema.shape.identity.unwrap()).toBe(BrainCharacterSchema);
  });

  it("shares the log level and reasoning effort enums with the shell config", () => {
    expect(appConfigSchema.shape.logLevel.unwrap()).toBe(logLevelSchema);
    expect(appConfigSchema.shape.aiReasoningEffort.unwrap()).toBe(
      reasoningEffortSchema,
    );
  });
});

const mockPlugin = {
  id: "test-plugin",
  version: "1.0.0",
  description: "Test plugin",
  type: "service",
  packageName: "@test/plugin",
  // The literal satisfied Plugin all along; the cast it carried was never
  // needed, and hid that fact.
  register: async (): Promise<PluginCapabilities> => ({
    tools: [],
    resources: [],
  }),
} satisfies Plugin;

describe("defineConfig", () => {
  const validConfig: AppConfigInput = {
    name: "test-app",
    version: "1.0.0",
    aiApiKey: "test-key",
    plugins: [mockPlugin],
  };

  it("should validate and return config", () => {
    const result = defineConfig(validConfig);

    expect(result.name).toBe("test-app");
    expect(result.version).toBe("1.0.0");
    expect(result.aiApiKey).toBe("test-key");
    expect(result.plugins).toHaveLength(1);
    expect(result.deployment).toBeDefined();
    expect(result.deployment.provider).toBe("hetzner");
  });

  it("should apply default values for optional fields", () => {
    const configWithoutOptionals: AppConfigInput = {
      name: "test-app",
      version: "1.0.0",
      plugins: [],
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
    const result = defineConfig({
      name: "test-app",
      version: "1.0.0",
      plugins: [mockPlugin],
    });

    expect(result.plugins).toHaveLength(1);
    expect(result.plugins?.[0]?.id).toBe("test-plugin");
  });

  it("should apply deployment defaults", () => {
    const result = defineConfig({
      name: "test-app",
      version: "1.0.0",
      plugins: [],
    });

    expect(result.deployment).toBeDefined();
    expect(result.deployment.provider).toBe("hetzner");
    expect(result.deployment.serverSize).toBe("cx33");
    expect(result.deployment.ports.default).toBe(3333);
    expect(result.deployment.cdn.enabled).toBe(false);
    expect(result.deployment.dns.enabled).toBe(false);
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

    expect(result.deployment.domain).toBe("example.com");
    expect(result.deployment.cdn.enabled).toBe(true);
    expect(result.deployment.cdn.provider).toBe("bunny");
    expect(result.deployment.provider).toBe("hetzner");
    expect(result.deployment.serverSize).toBe("cx33");
  });
});

import { describe, it, expect } from "bun:test";
import { z } from "zod";
import { ConfigTester, testPluginConstructor } from "../src";
import { validatePluginConfig, createPluginConfig } from "@brains/utils";

describe("ConfigTester", () => {
  // Example plugin config schema
  const pluginConfigSchema = createPluginConfig({
    apiKey: z.string().describe("API key for the service"),
    endpoint: z.string().url().optional().describe("API endpoint"),
    timeout: z.number().min(0).default(5000).describe("Request timeout in ms"),
    retries: z.number().int().min(0).max(10).default(3).describe("Number of retries"),
  });

  type PluginConfig = z.infer<typeof pluginConfigSchema>;

  describe("basic configuration testing", () => {
    const tester = new ConfigTester(pluginConfigSchema, "test-plugin");

    it("should test valid configuration", () => {
      tester.testConfig({
        name: "valid config",
        config: {
          apiKey: "test-key-123",
          endpoint: "https://api.example.com",
          timeout: 3000,
          retries: 5,
        },
        shouldPass: true,
      });
    });

    it("should test invalid configuration", () => {
      tester.testConfig({
        name: "missing required field",
        config: {
          endpoint: "https://api.example.com",
        },
        shouldPass: false,
        expectedError: "Required",
      });
    });

    it("should test multiple configurations", () => {
      tester.testConfigs([
        {
          name: "minimal valid config",
          config: { apiKey: "key" },
          shouldPass: true,
        },
        {
          name: "invalid URL",
          config: {
            apiKey: "key",
            endpoint: "not-a-url",
          },
          shouldPass: false,
          expectedError: "Invalid url",
        },
        {
          name: "negative timeout",
          config: {
            apiKey: "key",
            timeout: -1000,
          },
          shouldPass: false,
          expectedError: "Number must be greater than or equal to 0",
        },
      ]);
    });
  });

  describe("defaults testing", () => {
    const tester = new ConfigTester(pluginConfigSchema, "test-plugin");

    it("should test that defaults are applied", () => {
      tester.testDefaults(
        { apiKey: "test-key" },
        {
          timeout: 5000,
          retries: 3,
          enabled: true,  // From base plugin config
          debug: false,   // From base plugin config
        },
      );
    });
  });

  describe("required fields testing", () => {
    const tester = new ConfigTester(pluginConfigSchema, "test-plugin");

    it("should test required fields", () => {
      tester.testRequiredFields(["apiKey"]);
    });
  });

  describe("standard test cases", () => {
    it("should create standard test cases", () => {
      const tests = ConfigTester.createStandardTests<PluginConfig>({
        validConfig: {
          apiKey: "test-key",
          endpoint: "https://api.example.com",
        },
        invalidConfigs: [
          {
            name: "invalid type for apiKey",
            config: { apiKey: 123 },
            error: "Expected string",
          },
          {
            name: "too many retries",
            config: { apiKey: "key", retries: 20 },
            error: "Number must be less than or equal to 10",
          },
        ],
        defaultTests: [
          {
            name: "minimal config",
            input: { apiKey: "key" },
            expectedDefaults: {
              timeout: 5000,
              retries: 3,
              enabled: true,
              debug: false,
            },
          },
        ],
      });

      expect(tests).toHaveLength(5); // valid + empty + 2 invalid + 1 default
    });
  });

  describe("plugin constructor testing", () => {
    // Mock plugin class
    class TestPlugin {
      config: PluginConfig;

      constructor(config: unknown) {
        this.config = validatePluginConfig(
          pluginConfigSchema,
          config,
          "test-plugin",
        );
      }
    }

    it("should test plugin constructor", () => {
      testPluginConstructor(
        TestPlugin,
        { apiKey: "test-key" },
        [
          {
            config: {},
            error: /Invalid configuration/,
          },
          {
            config: { apiKey: 123 },
            error: /Expected string/,
          },
        ],
      );
    });
  });
});
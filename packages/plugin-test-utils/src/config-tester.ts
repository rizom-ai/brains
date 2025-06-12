import { expect } from "bun:test";
import type { z } from "zod";

/**
 * Test case for configuration validation
 */
export interface ConfigTestCase<T = unknown> {
  name: string;
  config: unknown;
  shouldPass: boolean;
  expectedError?: string | RegExp;
  expectedValue?: T;
}

/**
 * Test plugin configuration validation
 */
export class ConfigTester<TConfig> {
  private schema: z.ZodType<TConfig>;

  constructor(schema: z.ZodType<TConfig>, _pluginName: string) {
    this.schema = schema;
  }

  /**
   * Test a single configuration
   */
  testConfig(testCase: ConfigTestCase<TConfig>): void {
    const { config, shouldPass, expectedError, expectedValue } = testCase;

    if (shouldPass) {
      // Should parse successfully
      const result = this.schema.safeParse(config);
      expect(result.success).toBe(true);
      
      if (result.success && expectedValue !== undefined) {
        expect(result.data).toEqual(expectedValue);
      }
    } else {
      // Should fail validation
      const result = this.schema.safeParse(config);
      expect(result.success).toBe(false);
      
      if (!result.success && expectedError) {
        const errorMessage = result.error.errors
          .map((e) => e.message)
          .join(", ");
        
        if (typeof expectedError === "string") {
          expect(errorMessage).toContain(expectedError);
        } else {
          expect(errorMessage).toMatch(expectedError);
        }
      }
    }
  }

  /**
   * Test multiple configurations
   */
  testConfigs(testCases: ConfigTestCase<TConfig>[]): void {
    for (const testCase of testCases) {
      this.testConfig(testCase);
    }
  }

  /**
   * Test that defaults are applied correctly
   */
  testDefaults(
    minimalConfig: unknown,
    expectedDefaults: Partial<TConfig>,
  ): void {
    const result = this.schema.safeParse(minimalConfig);
    expect(result.success).toBe(true);
    
    if (result.success) {
      for (const [key, value] of Object.entries(expectedDefaults)) {
        const actualValue = (result.data as Record<string, unknown>)[key];
        expect(actualValue).toEqual(value);
      }
    }
  }

  /**
   * Test required fields
   */
  testRequiredFields(requiredFields: Array<keyof TConfig>): void {
    const emptyConfig = {};
    const result = this.schema.safeParse(emptyConfig);
    
    if (!result.success) {
      const missingFields = result.error.errors
        .filter((e) => e.code === "invalid_type" && e.received === "undefined")
        .map((e) => e.path[0]);
      
      for (const field of requiredFields) {
        expect(missingFields).toContain(field);
      }
    }
  }

  /**
   * Create standard test cases for common scenarios
   */
  static createStandardTests<T>(options: {
    validConfig: unknown;
    invalidConfigs?: Array<{
      name: string;
      config: unknown;
      error?: string | RegExp;
    }>;
    defaultTests?: Array<{
      name: string;
      input: unknown;
      expectedDefaults: Partial<T>;
    }>;
  }): ConfigTestCase<T>[] {
    const tests: ConfigTestCase<T>[] = [];

    // Valid config test
    tests.push({
      name: "should accept valid configuration",
      config: options.validConfig,
      shouldPass: true,
    });

    // Empty config test (usually valid with defaults)
    tests.push({
      name: "should accept empty configuration with defaults",
      config: {},
      shouldPass: true,
    });

    // Invalid configs
    if (options.invalidConfigs) {
      for (const { name, config, error } of options.invalidConfigs) {
        const testCase: ConfigTestCase<T> = {
          name: `should reject ${name}`,
          config,
          shouldPass: false,
        };
        if (error !== undefined) {
          testCase.expectedError = error;
        }
        tests.push(testCase);
      }
    }

    // Default value tests
    if (options.defaultTests) {
      for (const { name, input, expectedDefaults } of options.defaultTests) {
        tests.push({
          name: `should apply defaults for ${name}`,
          config: input,
          shouldPass: true,
          expectedValue: Object.assign({}, input, expectedDefaults) as T,
        });
      }
    }

    return tests;
  }
}

/**
 * Helper to test plugin constructor with configuration
 */
export function testPluginConstructor<T extends new (config: unknown) => unknown>(
  PluginClass: T,
  validConfig: unknown,
  invalidConfigs: Array<{ config: unknown; error?: string | RegExp }> = [],
): void {
  // Test valid config
  expect(() => new PluginClass(validConfig)).not.toThrow();

  // Test invalid configs
  for (const { config, error } of invalidConfigs) {
    if (error) {
      expect(() => new PluginClass(config)).toThrow(error);
    } else {
      expect(() => new PluginClass(config)).toThrow();
    }
  }
}
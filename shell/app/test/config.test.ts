import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { defineConfig, handleCLI } from "../src/config";
import type { AppConfig } from "../src/types";
import { SystemPlugin } from "@brains/system";

// Mock the App import to avoid circular dependencies in tests
const mockApp = {
  run: mock(() => Promise.resolve()),
  migrate: mock(() => Promise.resolve()),
};

void mock.module("../src/app.js", () => ({
  App: mockApp,
}));

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

describe("handleCLI", () => {
  const testConfig: AppConfig = {
    name: "test-app",
    version: "2.1.0",
    aiApiKey: "test-key",
    plugins: [],
  };

  // Store original values
  const originalArgv = process.argv;
  const originalExit = process.exit;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  // Mock console and process.exit
  const mockExit = mock((_code?: number): never => {
    return undefined as never;
  });
  const mockConsoleLog = mock(() => {});
  const mockConsoleError = mock(() => {});

  beforeEach(() => {
    // Reset mocks
    mockApp.run.mockClear();
    mockApp.migrate.mockClear();
    mockExit.mockClear();
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();

    // Mock process.exit and console
    process.exit = mockExit;
    console.log = mockConsoleLog;
    console.error = mockConsoleError;
  });

  afterEach(() => {
    // Restore original values
    process.argv = originalArgv;
    process.exit = originalExit;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  it("should run the app by default", () => {
    process.argv = ["bun", "brain.config.ts"];

    handleCLI(testConfig);

    expect(mockApp.run).toHaveBeenCalledWith(testConfig);
    expect(mockApp.migrate).not.toHaveBeenCalled();
  });

  it("should show help with --help flag", () => {
    process.argv = ["bun", "brain.config.ts", "--help"];

    handleCLI(testConfig);

    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("test-app v2.1.0"),
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Usage:"),
    );
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("should show help with -h flag", () => {
    process.argv = ["bun", "brain.config.ts", "-h"];

    handleCLI(testConfig);

    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("test-app v2.1.0"),
    );
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("should show version with --version flag", () => {
    process.argv = ["bun", "brain.config.ts", "--version"];

    handleCLI(testConfig);

    expect(mockConsoleLog).toHaveBeenCalledWith("test-app v2.1.0");
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("should show version with -v flag", () => {
    process.argv = ["bun", "brain.config.ts", "-v"];

    handleCLI(testConfig);

    expect(mockConsoleLog).toHaveBeenCalledWith("test-app v2.1.0");
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("should run migrations with --migrate flag", () => {
    process.argv = ["bun", "brain.config.ts", "--migrate"];

    handleCLI(testConfig);

    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Running migrations for test-app"),
    );
    expect(mockApp.migrate).toHaveBeenCalled();
  });

  it("should pass --cli flag through to app", () => {
    process.argv = ["bun", "brain.config.ts", "--cli"];

    handleCLI(testConfig);

    expect(mockApp.run).toHaveBeenCalledWith(testConfig);
  });

  it("should handle multiple flags", () => {
    process.argv = ["bun", "brain.config.ts", "--help", "--cli"];

    handleCLI(testConfig);

    // Help should take precedence
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Usage:"),
    );
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("should handle unknown flags by running app", () => {
    process.argv = ["bun", "brain.config.ts", "--unknown-flag"];

    handleCLI(testConfig);

    expect(mockApp.run).toHaveBeenCalledWith(testConfig);
  });
});

describe("CLI Integration", () => {
  it("should have proper help message format", () => {
    const testConfig: AppConfig = {
      name: "my-brain",
      version: "1.2.3",
      plugins: [],
    };

    const mockConsoleLog = mock(() => {});
    const mockExit = mock((_code?: number): never => {
      return undefined as never;
    });
    console.log = mockConsoleLog;
    process.exit = mockExit;
    process.argv = ["bun", "brain.config.ts", "--help"];

    handleCLI(testConfig);

    expect(mockConsoleLog).toHaveBeenCalled();
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("my-brain v1.2.3"),
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Usage:"),
    );
  });
});

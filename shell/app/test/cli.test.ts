import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { handleCLI } from "../src/cli";
import type { AppConfig } from "../src/types";

// Mock the App import to avoid circular dependencies in tests
const mockApp = {
  run: mock(() => Promise.resolve()),
  migrate: mock(() => Promise.resolve()),
};

void mock.module("../src/app", () => ({
  App: mockApp,
}));

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

  it("should run the app by default", async () => {
    process.argv = ["bun", "brain.config.ts"];

    await handleCLI(testConfig);

    expect(mockApp.run).toHaveBeenCalledWith(testConfig);
    expect(mockApp.migrate).not.toHaveBeenCalled();
  });

  it("should show help with --help flag", async () => {
    process.argv = ["bun", "brain.config.ts", "--help"];

    await handleCLI(testConfig);

    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("test-app v2.1.0"),
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Usage:"),
    );
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("should show help with -h flag", async () => {
    process.argv = ["bun", "brain.config.ts", "-h"];

    await handleCLI(testConfig);

    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("test-app v2.1.0"),
    );
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("should show version with --version flag", async () => {
    process.argv = ["bun", "brain.config.ts", "--version"];

    await handleCLI(testConfig);

    expect(mockConsoleLog).toHaveBeenCalledWith("test-app v2.1.0");
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("should show version with -v flag", async () => {
    process.argv = ["bun", "brain.config.ts", "-v"];

    await handleCLI(testConfig);

    expect(mockConsoleLog).toHaveBeenCalledWith("test-app v2.1.0");
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("should run migrations with --migrate flag", async () => {
    process.argv = ["bun", "brain.config.ts", "--migrate"];

    await handleCLI(testConfig);

    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Running migrations for test-app"),
    );
    expect(mockApp.migrate).toHaveBeenCalled();
  });

  it("should pass --cli flag through to app", async () => {
    process.argv = ["bun", "brain.config.ts", "--cli"];

    await handleCLI(testConfig);

    expect(mockApp.run).toHaveBeenCalledWith(testConfig);
  });

  it("should handle multiple flags", async () => {
    process.argv = ["bun", "brain.config.ts", "--help", "--cli"];

    await handleCLI(testConfig);

    // Help should take precedence
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Usage:"),
    );
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("should handle unknown flags by running app", async () => {
    process.argv = ["bun", "brain.config.ts", "--unknown-flag"];

    await handleCLI(testConfig);

    expect(mockApp.run).toHaveBeenCalledWith(testConfig);
  });
});

describe("CLI Integration", () => {
  it("should have proper help message format", async () => {
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

    await handleCLI(testConfig);

    expect(mockConsoleLog).toHaveBeenCalled();
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("my-brain v1.2.3"),
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Usage:"),
    );
  });
});
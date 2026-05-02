import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { handleCLI } from "../src/cli";
import { App } from "../src/app";
import type { AppConfig } from "../src/types";

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
  const originalCreate = App.create;

  // Mock console and process.exit
  const mockExit = mock((_code?: number): never => {
    return undefined as never;
  });
  const mockConsoleLog = mock(() => {});
  const mockConsoleError = mock(() => {});

  let runSpy: ReturnType<typeof mock>;

  beforeEach(() => {
    // Spy on App.run
    runSpy = mock(() => Promise.resolve());
    App.run = runSpy as typeof App.run;

    // Reset mocks
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
    App.create = originalCreate;
  });

  it("should run the app by default", async () => {
    process.argv = ["bun", "brain.config.ts"];

    await handleCLI(testConfig);

    expect(runSpy).toHaveBeenCalledWith(testConfig);
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

  it("should pass --cli flag through to app", async () => {
    process.argv = ["bun", "brain.config.ts", "--cli"];

    await handleCLI(testConfig);

    expect(runSpy).toHaveBeenCalledWith(testConfig);
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

  it("should handle --startup-check by initializing without running", async () => {
    const initialize = mock(() => Promise.resolve());
    const stop = mock(() => Promise.resolve());
    const createSpy = mock(() => ({ initialize, stop }));
    App.create = createSpy as unknown as typeof App.create;
    process.argv = ["bun", "brain.config.ts", "--startup-check"];

    await handleCLI(testConfig);

    expect(createSpy).toHaveBeenCalledWith(testConfig);
    expect(initialize).toHaveBeenCalledWith({ mode: "startup-check" });
    expect(stop).toHaveBeenCalled();
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("should handle unknown flags by running app", async () => {
    process.argv = ["bun", "brain.config.ts", "--unknown-flag"];

    await handleCLI(testConfig);

    expect(runSpy).toHaveBeenCalledWith(testConfig);
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

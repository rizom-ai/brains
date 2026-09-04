import {
  describe,
  expect,
  it,
  mock,
  beforeEach,
  afterEach,
  spyOn,
} from "bun:test";
import { handleCLI } from "../src/cli";
import {
  ProcessExited,
  expectProcessExit,
  genericSpy,
} from "@brains/test-utils";
import { App } from "../src/app";
import { defineConfig } from "../src/config";

describe("handleCLI", () => {
  const testConfig = defineConfig({
    name: "test-app",
    version: "2.1.0",
    aiApiKey: "test-key",
    plugins: [],
  });

  // Store original values
  const originalArgv = process.argv;
  const originalExit = process.exit;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalCreate = App.create;

  // Mock console and process.exit. The double throws rather than returning:
  // that is what `never` means, and it keeps the code under test from running
  // on past a point where the real process would be gone.
  const mockExit = mock((code?: number): never => {
    throw new ProcessExited(code);
  });
  const mockConsoleLog = mock(() => {});
  const mockConsoleError = mock(() => {});

  let runSpy: ReturnType<typeof mock>;

  beforeEach(() => {
    // Spy on App.run
    runSpy = mock(() => Promise.resolve());
    // mock() erases the type parameters App.run declares; genericSpy names that
    // as the only reason.
    App.run = genericSpy<typeof App.run>(runSpy);

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
    process.argv = ["bun", ".brain-entrypoint.ts"];

    await handleCLI(testConfig);

    expect(runSpy).toHaveBeenCalledWith(testConfig);
  });

  it("should show help with --help flag", async () => {
    process.argv = ["bun", ".brain-entrypoint.ts", "--help"];

    await expectProcessExit(handleCLI(testConfig), 0);

    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("test-app v2.1.0"),
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Usage:"),
    );
  });

  it("should show help with -h flag", async () => {
    process.argv = ["bun", ".brain-entrypoint.ts", "-h"];

    await expectProcessExit(handleCLI(testConfig), 0);

    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("test-app v2.1.0"),
    );
  });

  it("should show version with --version flag", async () => {
    process.argv = ["bun", ".brain-entrypoint.ts", "--version"];

    await expectProcessExit(handleCLI(testConfig), 0);

    expect(mockConsoleLog).toHaveBeenCalledWith("test-app v2.1.0");
  });

  it("should show version with -v flag", async () => {
    process.argv = ["bun", ".brain-entrypoint.ts", "-v"];

    await expectProcessExit(handleCLI(testConfig), 0);

    expect(mockConsoleLog).toHaveBeenCalledWith("test-app v2.1.0");
  });

  it("should pass --cli flag through to app", async () => {
    process.argv = ["bun", ".brain-entrypoint.ts", "--cli"];

    await handleCLI(testConfig);

    expect(runSpy).toHaveBeenCalledWith(testConfig);
  });

  it("should handle multiple flags", async () => {
    process.argv = ["bun", ".brain-entrypoint.ts", "--help", "--cli"];

    await expectProcessExit(handleCLI(testConfig), 0);

    // Help should take precedence
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Usage:"),
    );
  });

  it("should handle --startup-check by initializing without running", async () => {
    // A real App with its two methods spied, rather than a two-method literal:
    // App is a class, so no literal could ever satisfy typeof App.create, and
    // the CLI only needs initialize and stop to be observable.
    const app = originalCreate(testConfig);
    const initialize = spyOn(app, "initialize").mockResolvedValue(undefined);
    const stop = spyOn(app, "stop").mockResolvedValue(undefined);
    const createSpy = mock(() => app);
    App.create = createSpy;
    process.argv = ["bun", ".brain-entrypoint.ts", "--startup-check"];

    await handleCLI(testConfig);

    expect(createSpy).toHaveBeenCalledWith(testConfig);
    expect(initialize).toHaveBeenCalledWith({ mode: "startup-check" });
    expect(stop).toHaveBeenCalled();
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("should handle unknown flags by running app", async () => {
    process.argv = ["bun", ".brain-entrypoint.ts", "--unknown-flag"];

    await handleCLI(testConfig);

    expect(runSpy).toHaveBeenCalledWith(testConfig);
  });
});

describe("CLI Integration", () => {
  it("should have proper help message format", async () => {
    const testConfig = defineConfig({
      name: "my-brain",
      version: "1.2.3",
      plugins: [],
    });

    const mockConsoleLog = mock(() => {});
    const mockExit = mock((code?: number): never => {
      throw new ProcessExited(code);
    });
    console.log = mockConsoleLog;
    process.exit = mockExit;
    process.argv = ["bun", ".brain-entrypoint.ts", "--help"];

    await expectProcessExit(handleCLI(testConfig), 0);

    expect(mockConsoleLog).toHaveBeenCalled();
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("my-brain v1.2.3"),
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Usage:"),
    );
  });
});

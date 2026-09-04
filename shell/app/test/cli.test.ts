import { describe, expect, it, mock, spyOn } from "bun:test";
import { handleCLI, type CliIo } from "../src/cli";
import { App } from "../src/app";
import { defineConfig } from "../src/config";

/**
 * handleCLI takes everything it touches outside its arguments — argv, output,
 * exit, the App factory — through one injected object. So the test hands it a
 * fake and reads outcomes off that fake: no patching of process or console,
 * nothing to restore, and nothing left behind for the next file.
 */

/** Thrown by the fake exit so control flow stops exactly as process.exit would. */
class CliExit extends Error {
  readonly code: number;
  constructor(code: number) {
    super(`cli exit ${code}`);
    this.name = "CliExit";
    this.code = code;
  }
}

interface FakeIo extends CliIo {
  logged: string[];
  errored: string[];
}

function fakeIo(argv: string[], app: Partial<CliIo["app"]> = {}): FakeIo {
  const logged: string[] = [];
  const errored: string[] = [];
  return {
    argv,
    logged,
    errored,
    log: (line): void => {
      logged.push(line);
    },
    error: (line, ...detail): void => {
      errored.push([line, ...detail.map(String)].join(" "));
    },
    exit: (code): never => {
      throw new CliExit(code);
    },
    app: {
      create: app.create ?? App.create,
      run: app.run ?? (async (): Promise<void> => undefined),
    },
  };
}

/** The exit code handleCLI ended with, or null when it returned normally. */
async function exitCodeOf(run: Promise<void>): Promise<number | null> {
  return run.then(
    () => null,
    (error: unknown) => {
      if (error instanceof CliExit) return error.code;
      throw error;
    },
  );
}

const testConfig = defineConfig({
  name: "test-app",
  version: "2.1.0",
  aiApiKey: "test-key",
  plugins: [],
});

describe("handleCLI", () => {
  it("runs the app by default", async () => {
    const run = mock(async (): Promise<void> => undefined);
    const io = fakeIo([], { run });

    const code = await exitCodeOf(handleCLI(testConfig, undefined, io));

    expect(code).toBeNull();
    expect(run).toHaveBeenCalledWith(testConfig);
  });

  it("forwards runtime options to the app when given", async () => {
    const run = mock(async (): Promise<void> => undefined);
    const io = fakeIo([], { run });
    const runtimeOptions = { migrationsCompleted: true };

    await handleCLI(testConfig, runtimeOptions, io);

    expect(run).toHaveBeenCalledWith(testConfig, undefined, runtimeOptions);
  });

  it.each(["--help", "-h"])("prints help and exits 0 on %s", async (flag) => {
    const run = mock(async (): Promise<void> => undefined);
    const io = fakeIo([flag], { run });

    const code = await exitCodeOf(handleCLI(testConfig, undefined, io));

    expect(code).toBe(0);
    expect(io.logged.join("\n")).toContain("test-app v2.1.0");
    expect(io.logged.join("\n")).toContain("Usage:");
    expect(run).not.toHaveBeenCalled();
  });

  it.each(["--version", "-v"])(
    "prints the version and exits 0 on %s",
    async (flag) => {
      const io = fakeIo([flag]);

      const code = await exitCodeOf(handleCLI(testConfig, undefined, io));

      expect(code).toBe(0);
      expect(io.logged).toEqual(["test-app v2.1.0"]);
    },
  );

  it("lets --help win over other flags", async () => {
    const run = mock(async (): Promise<void> => undefined);
    const io = fakeIo(["--help", "--cli"], { run });

    const code = await exitCodeOf(handleCLI(testConfig, undefined, io));

    expect(code).toBe(0);
    expect(io.logged.join("\n")).toContain("Usage:");
    expect(run).not.toHaveBeenCalled();
  });

  it("treats an unknown flag as a normal run", async () => {
    const run = mock(async (): Promise<void> => undefined);
    const io = fakeIo(["--unknown-flag"], { run });

    await handleCLI(testConfig, undefined, io);

    expect(run).toHaveBeenCalledWith(testConfig);
  });

  it("initializes in startup-check mode and stops without running", async () => {
    // A real App with its two methods spied: App is a class, so no literal
    // satisfies typeof App.create, and only initialize and stop need observing.
    const app = App.create(testConfig);
    const initialize = spyOn(app, "initialize").mockResolvedValue(undefined);
    const stop = spyOn(app, "stop").mockResolvedValue(undefined);
    const create = mock(() => app);
    const run = mock(async (): Promise<void> => undefined);
    const io = fakeIo(["--startup-check"], { create, run });

    const code = await exitCodeOf(handleCLI(testConfig, undefined, io));

    expect(code).toBeNull();
    expect(create).toHaveBeenCalledWith(testConfig);
    expect(initialize).toHaveBeenCalledWith({ mode: "startup-check" });
    expect(stop).toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("exports deploy config as JSON and exits 0 without booting", async () => {
    const config = defineConfig({
      name: "deployable",
      version: "3.0.0",
      plugins: [],
    });
    const create = mock(() => {
      throw new Error("must not boot for --export-deploy-config");
    });
    const io = fakeIo(["--export-deploy-config"], { create });

    const code = await exitCodeOf(handleCLI(config, undefined, io));

    expect(code).toBe(0);
    expect(create).not.toHaveBeenCalled();
    const exported: unknown = JSON.parse(io.logged.join("\n"));
    expect(exported).toMatchObject({ name: "deployable", version: "3.0.0" });
  });

  it("rejects --tool-input that is not JSON with exit 1", async () => {
    const create = mock(() => {
      throw new Error("must not boot when the input is unusable");
    });
    const io = fakeIo(["--tool", "system_status", "--tool-input", "{nope"], {
      create,
    });

    const code = await exitCodeOf(handleCLI(testConfig, undefined, io));

    expect(code).toBe(1);
    expect(io.errored.join("\n")).toContain("--tool-input must be valid JSON");
    expect(create).not.toHaveBeenCalled();
  });
});

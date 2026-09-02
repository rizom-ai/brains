import { describe, it, expect, mock, afterEach, spyOn } from "bun:test";
import {
  App,
  STARTUP_CHECK_API_KEY,
  buildShellConfig,
  toAppConfig,
} from "../src/app";
import { MigrationManager } from "../src/migration-manager";
import { appConfigSchema } from "../src/types";
import { Shell, type Shell as ShellInstance } from "@brains/core";
import { ProcessExited } from "@brains/test-utils";

const originalNodeEnv = process.env["NODE_ENV"];

afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete process.env["NODE_ENV"];
  } else {
    process.env["NODE_ENV"] = originalNodeEnv;
  }
});

// Create a mock Shell
/**
 * A stand-in Shell for tests about App's orchestration.
 *
 * Shell is a class with a large surface, and App exposes getShell(): Shell as
 * public API, so narrowing the injection parameter would change that return
 * type for every consumer. Constructing a real Shell needs a full config and a
 * database, which these tests — about initialize/shutdown ordering — have no
 * use for. The widening is unavoidable; it lives in this one factory so it is
 * named once rather than at each call site.
 */
const createMockShell = (): ShellInstance => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- deliberate; the comment above explains why
  return {
    initialize: mock(() => Promise.resolve()),
    shutdown: mock(() => Promise.resolve()),
    getPluginManager: mock(() => ({
      registerPlugin: mock(() => {}),
    })),
    // eslint-disable-next-line no-restricted-syntax -- deliberate; the comment above explains why
  } as unknown as ShellInstance;
};

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("App", () => {
  describe("create", () => {
    it("should create an app with default config", () => {
      const mockShell = createMockShell();
      const app = App.create({}, mockShell);
      expect(app).toBeDefined();
      expect(app.getShell()).toBe(mockShell);
    });

    it("should create an app with custom config", () => {
      const mockShell = createMockShell();
      const app = App.create(
        {
          name: "test-app",
          version: "2.0.0",
          database: "/tmp/test.db",
          aiApiKey: "test-key",
          logLevel: "debug",
        },
        mockShell,
      );
      // The custom config must not displace the shell it was handed.
      expect(app.getShell()).toBe(mockShell);
    });

    it("should parse config with defaults", () => {
      const config = appConfigSchema.parse({});
      expect(config.name).toBe("brain-app");
      expect(config.version).toBe("1.0.0");
    });

    it("should validate config schema", () => {
      // Valid configs
      expect(() => {
        appConfigSchema.parse({
          name: "test",
          version: "1.0.0",
        });
      }).not.toThrow();

      expect(() => {
        appConfigSchema.parse({
          logLevel: "debug",
        });
      }).not.toThrow();
    });
  });

  describe("lifecycle", () => {
    it("should handle stop gracefully without initialization", async () => {
      const mockShell = createMockShell();
      const app = App.create({}, mockShell);

      expect(app.stop()).resolves.toBeUndefined();
      expect(mockShell.shutdown).toHaveBeenCalled();
    });

    it("should share one in-flight stop operation", async () => {
      const shutdown = deferred();
      const mockShell = createMockShell();
      mockShell.shutdown = mock(() => shutdown.promise);
      const app = App.create({}, mockShell);

      const first = app.stop();
      const second = app.stop();
      await Promise.resolve();

      expect(second).toBe(first);
      expect(mockShell.shutdown).toHaveBeenCalledTimes(1);

      shutdown.resolve();
      await first;
    });

    it("should acquire signal listeners once and release them on stop", async () => {
      const mockShell = createMockShell();
      const app = App.create({}, mockShell);
      const existingSigint = new Set(process.listeners("SIGINT"));
      const existingSigterm = new Set(process.listeners("SIGTERM"));

      await app.start();
      await app.start();

      const sigintHandler = process
        .listeners("SIGINT")
        .find((listener) => !existingSigint.has(listener));
      const sigtermHandler = process
        .listeners("SIGTERM")
        .find((listener) => !existingSigterm.has(listener));
      expect(sigintHandler).toBeDefined();
      expect(sigtermHandler).toBeDefined();

      await app.stop();

      expect(process.listeners("SIGINT")).not.toContain(sigintHandler);
      expect(process.listeners("SIGTERM")).not.toContain(sigtermHandler);
    });

    it("should run only one shutdown fiber for concurrent signals", async () => {
      const mockShell = createMockShell();
      const app = App.create({}, mockShell);
      const existingSigint = new Set(process.listeners("SIGINT"));
      const existingSigterm = new Set(process.listeners("SIGTERM"));
      const originalExit = process.exit;
      const exit = mock((code?: number): never => {
        throw new ProcessExited(code);
      });

      try {
        process.exit = exit;
        await app.start();
        const sigintHandler = process
          .listeners("SIGINT")
          .find((listener) => !existingSigint.has(listener));
        const sigtermHandler = process
          .listeners("SIGTERM")
          .find((listener) => !existingSigterm.has(listener));
        if (!sigintHandler || !sigtermHandler) {
          throw new Error("Expected app signal handlers");
        }

        sigintHandler("SIGINT");
        sigtermHandler("SIGTERM");
        await Bun.sleep(10);

        expect(mockShell.shutdown).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledWith(0);
      } finally {
        process.exit = originalExit;
        await app.stop();
      }
    });

    it("should initialize shell during app initialization", async () => {
      const mockShell = createMockShell();
      const app = App.create({ logLevel: "error" }, mockShell);

      await app.initialize();

      expect(mockShell.initialize).toHaveBeenCalled();
    });

    it("skips child migrations only after the supervisor schema barrier", async () => {
      const mockShell = createMockShell();
      const migrationSpy = spyOn(
        MigrationManager.prototype,
        "runAllMigrations",
      ).mockImplementation(async () => undefined);
      const createFreshSpy = spyOn(Shell, "createFresh").mockReturnValue(
        mockShell,
      );

      try {
        const app = App.create({});
        await app.initialize(undefined, { migrationsCompleted: true });

        expect(migrationSpy).not.toHaveBeenCalled();
        expect(mockShell.initialize).toHaveBeenCalled();
      } finally {
        createFreshSpy.mockRestore();
        migrationSpy.mockRestore();
      }
    });
  });

  describe("getters", () => {
    it("should provide access to shell", () => {
      const mockShell = createMockShell();
      const app = App.create({}, mockShell);
      expect(app.getShell()).toBe(mockShell);
    });
  });
});

describe("buildShellConfig", () => {
  // A pure function of AppConfig and initialize options. These used to spy
  // Shell.createFresh to capture what App passed it — six spies, each with a
  // MigrationManager spy beside it and a try/finally to restore both — when
  // the thing under test was a value that could simply be returned.

  it("injects the startup-check API key placeholder when no key is configured", () => {
    const shellConfig = buildShellConfig(toAppConfig({}), {
      mode: "startup-check",
    });

    expect(shellConfig.ai?.apiKey).toBe(STARTUP_CHECK_API_KEY);
  });

  it("leaves ai unset outside startup-check when nothing configures it", () => {
    expect(buildShellConfig(toAppConfig({})).ai).toBeUndefined();
  });

  it("prefers the configured key over the startup-check placeholder", () => {
    const shellConfig = buildShellConfig(toAppConfig({ aiApiKey: "real" }), {
      mode: "startup-check",
    });

    expect(shellConfig.ai?.apiKey).toBe("real");
  });

  it("derives site URLs from the deployment and prefers local ones outside production", () => {
    delete process.env["NODE_ENV"];

    const shellConfig = buildShellConfig(
      toAppConfig({
        deployment: {
          domain: "brain.example.com",
          ports: { production: 9090 },
        },
      }),
    );

    expect(shellConfig.siteBaseUrl).toBe("brain.example.com");
    expect(shellConfig.localSiteUrl).toBe("http://localhost:9090");
    expect(shellConfig.preferLocalUrls).toBe(true);
  });

  it("prefers public URLs in production", () => {
    process.env["NODE_ENV"] = "production";

    const shellConfig = buildShellConfig(
      toAppConfig({
        deployment: {
          domain: "brain.example.com",
          ports: { production: 9090 },
        },
      }),
    );

    expect(shellConfig.preferLocalUrls).toBe(false);
  });

  it("passes a configured identity through", () => {
    const identity = {
      name: "Test Assistant",
      role: "Technical assistant",
      purpose: "Help with technical tasks",
      values: ["precision", "efficiency"],
    };

    expect(buildShellConfig(toAppConfig({ identity })).identity).toEqual(
      identity,
    );
  });

  it("leaves identity unset when none is configured", () => {
    // The shell owns the default; App must not invent one or the shell's own
    // default becomes unreachable.
    expect(buildShellConfig(toAppConfig({})).identity).toBeUndefined();
  });
});

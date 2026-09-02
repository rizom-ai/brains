import { describe, it, expect, mock, afterEach, spyOn } from "bun:test";
import { App, STARTUP_CHECK_API_KEY } from "../src/app";
import { MigrationManager } from "../src/migration-manager";
import { appConfigSchema } from "../src/types";
import { Shell, type Shell as ShellInstance } from "@brains/core";

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
      expect(app).toBeDefined();
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
      // process.exit is declared to return never, and a stub that lets the
      // handler continue cannot. There is nothing to narrow — it is a global.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above
      const exit = mock((_code?: number): never => undefined as never);

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

    it("should provide a startup-check API key placeholder when no key is configured", async () => {
      const mockShell = createMockShell();
      let shellConfig: Parameters<typeof Shell.createFresh>[0];
      const migrationSpy = spyOn(
        MigrationManager.prototype,
        "runAllMigrations",
      ).mockImplementation(async () => undefined);
      const createFreshSpy = spyOn(Shell, "createFresh").mockImplementation(
        (config) => {
          shellConfig = config;
          return mockShell;
        },
      );

      try {
        const app = App.create({});
        await app.initialize({ mode: "startup-check" });

        expect(shellConfig?.ai?.apiKey).toBe(STARTUP_CHECK_API_KEY);
        expect(mockShell.initialize).toHaveBeenCalledWith({
          mode: "startup-check",
        });
      } finally {
        createFreshSpy.mockRestore();
        migrationSpy.mockRestore();
      }
    });

    it("should prefer localhost runtime URLs outside production", async () => {
      const mockShell = createMockShell();
      let shellConfig: Parameters<typeof Shell.createFresh>[0];

      delete process.env["NODE_ENV"];
      const migrationSpy = spyOn(
        MigrationManager.prototype,
        "runAllMigrations",
      ).mockImplementation(async () => undefined);
      const createFreshSpy = spyOn(Shell, "createFresh").mockImplementation(
        (config) => {
          shellConfig = config;
          return mockShell;
        },
      );

      try {
        const app = App.create({
          deployment: {
            domain: "brain.example.com",
            ports: { production: 9090 },
          },
        });
        await app.initialize();

        expect(shellConfig?.siteBaseUrl).toBe("brain.example.com");
        expect(shellConfig?.localSiteUrl).toBe("http://localhost:9090");
        expect(shellConfig?.preferLocalUrls).toBe(true);
      } finally {
        createFreshSpy.mockRestore();
        migrationSpy.mockRestore();
      }
    });

    it("should prefer public URLs in production", async () => {
      const mockShell = createMockShell();
      let shellConfig: Parameters<typeof Shell.createFresh>[0];

      process.env["NODE_ENV"] = "production";
      const migrationSpy = spyOn(
        MigrationManager.prototype,
        "runAllMigrations",
      ).mockImplementation(async () => undefined);
      const createFreshSpy = spyOn(Shell, "createFresh").mockImplementation(
        (config) => {
          shellConfig = config;
          return mockShell;
        },
      );

      try {
        const app = App.create({
          deployment: {
            domain: "brain.example.com",
            ports: { production: 9090 },
          },
        });
        await app.initialize();

        expect(shellConfig?.siteBaseUrl).toBe("brain.example.com");
        expect(shellConfig?.localSiteUrl).toBe("http://localhost:9090");
        expect(shellConfig?.preferLocalUrls).toBe(false);
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

  describe("run", () => {
    it("should have static run method", () => {
      expect(typeof App.run).toBe("function");
    });

    it("should have instance run method", () => {
      const mockShell = createMockShell();
      const app = App.create({}, mockShell);
      expect(typeof app.run).toBe("function");
    });
  });

  describe("identity configuration", () => {
    it("should accept identity in app config", () => {
      const mockShell = createMockShell();
      const customIdentity = {
        name: "Test Assistant",
        role: "Technical assistant",
        purpose: "Help with technical tasks",
        values: ["precision", "efficiency"],
      };

      const app = App.create(
        {
          identity: customIdentity,
        },
        mockShell,
      );

      expect(app).toBeDefined();
    });

    it("should work without identity config (using default)", () => {
      const mockShell = createMockShell();
      const app = App.create({}, mockShell);
      expect(app).toBeDefined();
    });
  });
});

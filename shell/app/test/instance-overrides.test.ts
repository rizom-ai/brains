import { describe, expect, test } from "bun:test";
import {
  defineBrain,
  type InterfaceConstructor,
} from "../src/brain-definition";
import { resolve } from "../src/brain-resolver";
import { parseInstanceOverrides } from "../src/instance-overrides";
import type { Plugin } from "@brains/plugins";

// --- Test helpers ---

function createMockPlugin(id: string, config: unknown): Plugin {
  return {
    id,
    version: "1.0.0",
    description: `${id} plugin`,
    packageName: `@brains/${id}`,
    type: "service",
    register: async (): Promise<void> => {},
    config,
  } as unknown as Plugin;
}

function createMockFactory(
  id: string,
): [(config: unknown) => Plugin, unknown[]] {
  const configs: unknown[] = [];
  const factory = (config: unknown): Plugin => {
    configs.push(config);
    return createMockPlugin(id, config);
  };
  return [factory, configs];
}

class MockWebserver {
  public readonly id = "webserver";
  public readonly version = "1.0.0";
  public readonly description = "Mock webserver";
  public readonly packageName = "@brains/webserver";
  public readonly type = "interface";
  public config: unknown;
  constructor(config: unknown) {
    this.config = config;
  }
  async register(): Promise<void> {}
}

class MockMatrix {
  public readonly id = "matrix";
  public readonly version = "1.0.0";
  public readonly description = "Mock matrix";
  public readonly packageName = "@brains/matrix";
  public readonly type = "interface";
  public config: unknown;
  constructor(config: unknown) {
    this.config = config;
  }
  async register(): Promise<void> {}
}

class MockMCP {
  public readonly id = "mcp";
  public readonly version = "1.0.0";
  public readonly description = "Mock MCP";
  public readonly packageName = "@brains/mcp";
  public readonly type = "interface";
  public config: unknown;
  constructor(config: unknown) {
    this.config = config;
  }
  async register(): Promise<void> {}
}

// --- parseInstanceOverrides ---

describe("parseInstanceOverrides", () => {
  test("should parse brain field", () => {
    const result = parseInstanceOverrides('brain: "@brains/relay"');
    expect(result.brain).toBe("@brains/relay");
  });

  test("should parse name override", () => {
    const result = parseInstanceOverrides(
      'brain: "@brains/relay"\nname: team-staging',
    );
    expect(result.name).toBe("team-staging");
  });

  test("should parse logLevel", () => {
    const result = parseInstanceOverrides(
      'brain: "@brains/relay"\nlogLevel: debug',
    );
    expect(result.logLevel).toBe("debug");
  });

  test("should parse port as number", () => {
    const result = parseInstanceOverrides('brain: "@brains/relay"\nport: 9090');
    expect(result.port).toBe(9090);
  });

  test("should parse domain", () => {
    const result = parseInstanceOverrides(
      'brain: "@brains/relay"\ndomain: staging.recall.ai',
    );
    expect(result.domain).toBe("staging.recall.ai");
  });

  test("should parse database", () => {
    const result = parseInstanceOverrides(
      'brain: "@brains/relay"\ndatabase: file:./data/brain.db',
    );
    expect(result.database).toBe("file:./data/brain.db");
  });

  test("should parse disable list", () => {
    const result = parseInstanceOverrides(
      'brain: "@brains/relay"\ndisable:\n  - matrix\n  - git-sync',
    );
    expect(result.disable).toEqual(["matrix", "git-sync"]);
  });

  test("should parse inline disable list", () => {
    const result = parseInstanceOverrides(
      'brain: "@brains/relay"\ndisable: [matrix, git-sync]',
    );
    expect(result.disable).toEqual(["matrix", "git-sync"]);
  });

  test("should parse plugins section with flat config", () => {
    const result = parseInstanceOverrides(
      'brain: "@brains/relay"\nplugins:\n  webserver:\n    productionPort: 9090',
    );
    expect(result.plugins).toEqual({
      webserver: { productionPort: 9090 },
    });
  });

  test("should parse plugins section with multiple plugins", () => {
    const result = parseInstanceOverrides(
      'brain: "@brains/relay"\nplugins:\n  webserver:\n    productionPort: 9090\n  git-sync:\n    autoSync: false',
    );
    expect(result.plugins).toEqual({
      webserver: { productionPort: 9090 },
      "git-sync": { autoSync: false },
    });
  });

  test("should skip comments and empty lines", () => {
    const yaml = `# This is a comment
brain: "@brains/relay"

# Another comment
logLevel: debug
`;
    const result = parseInstanceOverrides(yaml);
    expect(result.brain).toBe("@brains/relay");
    expect(result.logLevel).toBe("debug");
  });

  test("should handle quoted string values", () => {
    const result = parseInstanceOverrides(
      'brain: "@brains/relay"\nname: "my-brain"',
    );
    expect(result.name).toBe("my-brain");
  });

  test("should return empty overrides for minimal yaml", () => {
    const result = parseInstanceOverrides('brain: "@brains/relay"');
    expect(result.brain).toBe("@brains/relay");
    expect(result.name).toBeUndefined();
    expect(result.logLevel).toBeUndefined();
    expect(result.port).toBeUndefined();
    expect(result.disable).toBeUndefined();
    expect(result.plugins).toBeUndefined();
  });
});

// --- resolve with overrides ---

describe("resolve with instance overrides", () => {
  test("should override name", () => {
    const def = defineBrain({
      name: "team-brain",
      version: "1.0.0",
      capabilities: [],
      interfaces: [],
    });

    const config = resolve(def, {}, { name: "team-brain-staging" });
    expect(config.name).toBe("team-brain-staging");
  });

  test("should override logLevel", () => {
    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [],
      interfaces: [],
    });

    const config = resolve(def, {}, { logLevel: "debug" });
    expect(config.logLevel).toBe("debug");
  });

  test("should override database", () => {
    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [],
      interfaces: [],
    });

    const config = resolve(def, {}, { database: "file:./custom.db" });
    expect(config.database).toBe("file:./custom.db");
  });

  test("should override domain in deployment", () => {
    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [],
      interfaces: [],
      deployment: {
        domain: "prod.example.com",
        cdn: { enabled: true, provider: "bunny" },
      },
    });

    const config = resolve(def, {}, { domain: "staging.example.com" });
    expect(config.deployment?.domain).toBe("staging.example.com");
  });

  test("should set domain in deployment when definition has no deployment", () => {
    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [],
      interfaces: [],
    });

    const config = resolve(def, {}, { domain: "my.example.com" });
    expect(config.deployment?.domain).toBe("my.example.com");
  });

  test("should override port in deployment", () => {
    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [],
      interfaces: [],
    });

    const config = resolve(def, {}, { port: 9090 });
    expect(config.deployment?.ports?.production).toBe(9090);
  });

  test("should disable capabilities by plugin id", () => {
    const [systemFactory] = createMockFactory("system");
    const [gitSyncFactory] = createMockFactory("git-sync");
    const [topicsFactory] = createMockFactory("topics");

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [
        [systemFactory, {}],
        [gitSyncFactory, {}],
        [topicsFactory, {}],
      ],
      interfaces: [],
    });

    const config = resolve(def, {}, { disable: ["git-sync"] });
    const pluginIds = config.plugins?.map((p) => p.id) ?? [];

    expect(pluginIds).toContain("system");
    expect(pluginIds).toContain("topics");
    expect(pluginIds).not.toContain("git-sync");
  });

  test("should disable interfaces by plugin id", () => {
    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [],
      interfaces: [
        [MockMCP as unknown as InterfaceConstructor, () => ({ port: 3333 })],
        [
          MockMatrix as unknown as InterfaceConstructor,
          () => ({ homeserver: "https://matrix.org" }),
        ],
        [MockWebserver as unknown as InterfaceConstructor, () => ({})],
      ],
    });

    const config = resolve(def, {}, { disable: ["matrix"] });
    const pluginIds = config.plugins?.map((p) => p.id) ?? [];

    expect(pluginIds).toContain("mcp");
    expect(pluginIds).toContain("webserver");
    expect(pluginIds).not.toContain("matrix");
  });

  test("should disable both capabilities and interfaces", () => {
    const [gitSyncFactory] = createMockFactory("git-sync");

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [[gitSyncFactory, {}]],
      interfaces: [[MockMatrix as unknown as InterfaceConstructor, () => ({})]],
    });

    const config = resolve(def, {}, { disable: ["git-sync", "matrix"] });
    expect(config.plugins).toHaveLength(0);
  });

  test("should apply plugin config overrides to capabilities", () => {
    const configs: unknown[] = [];
    const factory = (config: unknown): Plugin => {
      configs.push(config);
      return createMockPlugin("git-sync", config);
    };

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [
        [factory, { repo: "user/repo", autoSync: true, autoPush: true }],
      ],
      interfaces: [],
    });

    const config = resolve(
      def,
      {},
      {
        plugins: { "git-sync": { autoSync: false } },
      },
    );

    // Should have been instantiated twice: once to get ID, once with merged config
    // The final plugin should have the merged config
    const gitSync = config.plugins?.find((p) => p.id === "git-sync");
    expect(gitSync).toBeDefined();
    expect(
      (gitSync as unknown as { config: Record<string, unknown> }).config,
    ).toEqual({
      repo: "user/repo",
      autoSync: false,
      autoPush: true,
    });
  });

  test("should apply plugin config overrides to interfaces", () => {
    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [],
      interfaces: [
        [
          MockWebserver as unknown as InterfaceConstructor,
          () => ({ productionPort: 8080 }),
        ],
      ],
    });

    const config = resolve(
      def,
      {},
      {
        plugins: { webserver: { productionPort: 9090 } },
      },
    );

    const webserver = config.plugins?.find((p) => p.id === "webserver");
    expect(webserver).toBeDefined();
    expect(
      (webserver as unknown as { config: Record<string, unknown> }).config,
    ).toEqual({ productionPort: 9090 });
  });

  test("should not re-instantiate plugins without overrides", () => {
    let callCount = 0;
    const factory = (config: unknown): Plugin => {
      callCount++;
      return createMockPlugin("system", config);
    };

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [[factory, {}]],
      interfaces: [],
    });

    // Plugin overrides only for git-sync, not system
    resolve(def, {}, { plugins: { "git-sync": { autoSync: false } } });

    // system factory should only be called once (no re-instantiation needed)
    expect(callCount).toBe(1);
  });

  test("should combine disable and plugin overrides", () => {
    const [systemFactory] = createMockFactory("system");
    const configs: unknown[] = [];
    const gitSyncFactory = (config: unknown): Plugin => {
      configs.push(config);
      return createMockPlugin("git-sync", config);
    };

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [
        [systemFactory, {}],
        [gitSyncFactory, { autoSync: true }],
      ],
      interfaces: [[MockMatrix as unknown as InterfaceConstructor, () => ({})]],
    });

    const config = resolve(
      def,
      {},
      {
        disable: ["matrix"],
        plugins: { "git-sync": { autoSync: false } },
      },
    );

    const pluginIds = config.plugins?.map((p) => p.id) ?? [];
    expect(pluginIds).toContain("system");
    expect(pluginIds).toContain("git-sync");
    expect(pluginIds).not.toContain("matrix");

    const gitSync = config.plugins?.find((p) => p.id === "git-sync");
    expect(
      (gitSync as unknown as { config: Record<string, unknown> }).config,
    ).toEqual({ autoSync: false });
  });

  test("should ignore plugin overrides for disabled plugins", () => {
    const [gitSyncFactory, configs] = createMockFactory("git-sync");

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [[gitSyncFactory, {}]],
      interfaces: [],
    });

    const config = resolve(
      def,
      {},
      {
        disable: ["git-sync"],
        plugins: { "git-sync": { autoSync: false } },
      },
    );

    expect(config.plugins).toHaveLength(0);
    // Factory called once for the initial instantiation (to get ID), then skipped
    expect(configs).toHaveLength(1);
  });

  test("yaml overrides should take precedence over env for logLevel", () => {
    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [],
      interfaces: [],
    });

    const config = resolve(def, { LOG_LEVEL: "warn" }, { logLevel: "debug" });
    expect(config.logLevel).toBe("debug");
  });

  test("yaml overrides should take precedence over env for database", () => {
    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [],
      interfaces: [],
    });

    const config = resolve(
      def,
      { DATABASE_URL: "file:./env.db" },
      { database: "file:./yaml.db" },
    );
    expect(config.database).toBe("file:./yaml.db");
  });

  test("should work with no overrides (backward compatible)", () => {
    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [],
      interfaces: [],
    });

    // No third argument — should still work
    const config = resolve(def, {});
    expect(config.name).toBe("test");
  });
});

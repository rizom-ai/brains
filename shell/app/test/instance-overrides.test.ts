import { describe, expect, test } from "bun:test";
import {
  defineBrain,
  type InterfaceConstructor,
  type PluginConfig,
  type PluginFactory,
} from "../src/brain-definition";
import type { SitePackage } from "../src/site-package";
import { resolve } from "../src/brain-resolver";
import { registerPackage } from "../src/package-registry";
import { parseInstanceOverrides } from "../src/instance-overrides";
import type { Plugin, IShell, PluginCapabilities } from "@brains/plugins";

// --- Test helpers ---

interface MockPlugin extends Plugin {
  config: PluginConfig;
}

function createMockPlugin(id: string, config: PluginConfig): MockPlugin {
  return {
    id,
    version: "1.0.0",
    description: `${id} plugin`,
    packageName: `@brains/${id}`,
    type: "service",
    register: async (_shell: IShell): Promise<PluginCapabilities> => ({
      tools: [],
      resources: [],
    }),
    config,
  };
}

function createMockFactory(id: string): [PluginFactory, PluginConfig[]] {
  const configs: PluginConfig[] = [];
  const factory: PluginFactory = (config) => {
    configs.push(config);
    return createMockPlugin(id, config);
  };
  return [factory, configs];
}

class MockWebserver implements Plugin {
  public readonly id = "webserver";
  public readonly version = "1.0.0";
  public readonly description = "Mock webserver";
  public readonly packageName = "@brains/webserver";
  public readonly type = "interface" as const;
  public config: PluginConfig;
  constructor(config: PluginConfig) {
    this.config = config;
  }
  async register(_shell: IShell): Promise<PluginCapabilities> {
    return { tools: [], resources: [] };
  }
}

class MockChat implements Plugin {
  public readonly id = "chat";
  public readonly version = "1.0.0";
  public readonly description = "Mock chat";
  public readonly packageName = "@brains/chat";
  public readonly type = "interface" as const;
  public config: PluginConfig;
  constructor(config: PluginConfig) {
    this.config = config;
  }
  async register(_shell: IShell): Promise<PluginCapabilities> {
    return { tools: [], resources: [] };
  }
}

class MockMCP implements Plugin {
  public readonly id = "mcp";
  public readonly version = "1.0.0";
  public readonly description = "Mock MCP";
  public readonly packageName = "@brains/mcp";
  public readonly type = "interface" as const;
  public config: PluginConfig;
  constructor(config: PluginConfig) {
    this.config = config;
  }
  async register(_shell: IShell): Promise<PluginCapabilities> {
    return { tools: [], resources: [] };
  }
}

function getConfig(plugin: Plugin | undefined): PluginConfig {
  expect(plugin).toBeDefined();
  return (plugin as MockPlugin).config;
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
    expect(result.preset).toBeUndefined();
    expect(result.plugins).toBeUndefined();
  });

  test("should parse nested maps in plugin config", () => {
    const yaml = `brain: "@brains/rover"
plugins:
  a2a:
    organization: rizom.ai
    trustedTokens:
      token-abc: mylittlephoney
      token-def: relay
`;
    const result = parseInstanceOverrides(yaml);
    expect(result.plugins?.["a2a"]).toEqual({
      organization: "rizom.ai",
      trustedTokens: {
        "token-abc": "mylittlephoney",
        "token-def": "relay",
      },
    });
  });

  test("should interpolate ${ENV_VAR} in values", () => {
    process.env["TEST_DB_URL"] = "file:./test.db";
    try {
      const result = parseInstanceOverrides(
        'brain: "@brains/rover"\ndatabase: "${TEST_DB_URL}"',
      );
      expect(result.database).toBe("file:./test.db");
    } finally {
      delete process.env["TEST_DB_URL"];
    }
  });

  test("should interpolate ${ENV_VAR} in map keys", () => {
    process.env["TEST_A2A_TOKEN"] = "secret-token-xyz";
    try {
      const yaml = `brain: "@brains/rover"
plugins:
  a2a:
    trustedTokens:
      \${TEST_A2A_TOKEN}: mylittlephoney
`;
      const result = parseInstanceOverrides(yaml);
      expect(result.plugins).toEqual({
        a2a: {
          trustedTokens: {
            "secret-token-xyz": "mylittlephoney",
          },
        },
      });
    } finally {
      delete process.env["TEST_A2A_TOKEN"];
    }
  });

  test("should drop entries with unset env vars", () => {
    delete process.env["NONEXISTENT_VAR"];
    const yaml = `brain: "@brains/rover"
plugins:
  a2a:
    trustedTokens:
      \${NONEXISTENT_VAR}: mylittlephoney
      real-token: relay
`;
    const result = parseInstanceOverrides(yaml);
    expect(result.plugins).toEqual({
      a2a: {
        trustedTokens: {
          "real-token": "relay",
        },
      },
    });
  });

  test("should parse permissions section with rules", () => {
    const yaml = `brain: "@brains/rover"
permissions:
  anchors:
    - "cli:*"
    - "mcp:stdio"
  rules:
    - pattern: "a2a:mylittlephoney"
      level: trusted
    - pattern: "a2a:*"
      level: public
`;
    const result = parseInstanceOverrides(yaml);
    expect(result.permissions?.anchors).toEqual(["cli:*", "mcp:stdio"]);
    expect(result.permissions?.rules).toEqual([
      { pattern: "a2a:mylittlephoney", level: "trusted" },
      { pattern: "a2a:*", level: "public" },
    ]);
  });

  test("should parse anchors and trusted in permissions", () => {
    const yaml = `brain: "@brains/rover"
permissions:
  anchors:
    - "cli:*"
  trusted:
    - "discord:123456789"
`;
    const result = parseInstanceOverrides(yaml);
    expect(result.permissions?.anchors).toEqual(["cli:*"]);
    expect(result.permissions?.trusted).toEqual(["discord:123456789"]);
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

  test("should apply plugin config overrides to capabilities", () => {
    const configs: unknown[] = [];
    const factory: PluginFactory = (config) => {
      configs.push(config);
      return createMockPlugin("git-sync", config);
    };

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [
        [
          "git-sync",
          factory,
          { repo: "user/repo", autoSync: true, autoPush: true },
        ],
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

    const gitSync = config.plugins?.find((p) => p.id === "git-sync");
    expect(gitSync).toBeDefined();
    expect(getConfig(gitSync)).toMatchObject({
      repo: "user/repo",
      autoSync: false,
      autoPush: true,
    });
  });

  test("should deep merge nested plugin config overrides", () => {
    const configs: unknown[] = [];
    const factory: PluginFactory = (config) => {
      configs.push(config);
      return createMockPlugin("directory-sync", config);
    };

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [
        [
          "directory-sync",
          factory,
          {
            seedContent: true,
            initialSync: true,
            git: {
              authorName: "Rover",
              authorEmail: "rover@rizom.ai",
            },
          },
        ],
      ],
      interfaces: [],
    });

    const config = resolve(
      def,
      {},
      {
        plugins: {
          "directory-sync": {
            git: {
              repo: "rizom-ai/content",
              authToken: "secret",
            },
          },
        },
      },
    );

    const ds = config.plugins?.find((p) => p.id === "directory-sync");
    const dsConfig = getConfig(ds) as Record<string, unknown>;
    const git = dsConfig["git"] as Record<string, unknown>;

    // Brain model defaults preserved
    expect(git["authorName"]).toBe("Rover");
    expect(git["authorEmail"]).toBe("rover@rizom.ai");
    // brain.yaml overrides merged in
    expect(git["repo"]).toBe("rizom-ai/content");
    expect(git["authToken"]).toBe("secret");
    // Other top-level config preserved
    expect(dsConfig["seedContent"]).toBe(true);
    expect(dsConfig["initialSync"]).toBe(true);
  });

  test("should apply plugin config overrides to interfaces", () => {
    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [],
      interfaces: [
        [
          "webserver",
          MockWebserver as InterfaceConstructor,
          (): PluginConfig => ({ productionPort: 8080 }),
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
    expect(getConfig(webserver)).toMatchObject({ productionPort: 9090 });
  });

  test("should apply targeted override after construction", () => {
    // Plugin constructs successfully with empty config,
    // then resolver applies matching override by plugin ID.
    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [],
      interfaces: [
        [
          "webserver",
          MockWebserver as InterfaceConstructor,
          (): PluginConfig => ({}),
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
    expect(getConfig(webserver)).toMatchObject({ productionPort: 9090 });
  });

  test("should not bleed overrides between plugins", () => {
    // Override for git-sync should NOT appear in system's config.
    // This is the key collision regression: merging all overrides into
    // every plugin could cause wrong values when keys overlap.
    const [systemFactory, systemConfigs] = createMockFactory("system");
    const [gitSyncFactory] = createMockFactory("git-sync");

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [
        ["system", systemFactory, { systemKey: "original" }],
        ["git-sync", gitSyncFactory, { autoSync: true }],
      ],
      interfaces: [],
    });

    resolve(
      def,
      {},
      {
        plugins: {
          "git-sync": { autoSync: false, repo: "user/repo" },
        },
      },
    );

    // system should have only its own config, not git-sync's override keys
    const systemConfig = systemConfigs[0];
    expect(systemConfig).toEqual({ systemKey: "original" });
    expect(systemConfig).not.toHaveProperty("autoSync");
    expect(systemConfig).not.toHaveProperty("repo");
  });

  test("should not re-instantiate plugins without overrides", () => {
    let callCount = 0;
    const factory: PluginFactory = (config) => {
      callCount++;
      return createMockPlugin("system", config);
    };

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [["system", factory, {}]],
      interfaces: [],
    });

    // Plugin overrides only for git-sync, not system
    resolve(def, {}, { plugins: { "git-sync": { autoSync: false } } });

    // system factory should only be called once (no override for it)
    expect(callCount).toBe(1);
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

  test("should apply permissions rules from yaml overrides", () => {
    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [],
      interfaces: [],
      permissions: {
        rules: [{ pattern: "cli:*", level: "anchor" as const }],
      },
    });

    const config = resolve(
      def,
      {},
      {
        permissions: {
          rules: [
            { pattern: "a2a:mylittlephoney", level: "trusted" as const },
            { pattern: "a2a:*", level: "public" as const },
          ],
        },
      },
    );

    // yaml rules override definition rules
    expect(config.permissions?.rules).toEqual([
      { pattern: "a2a:mylittlephoney", level: "trusted" },
      { pattern: "a2a:*", level: "public" },
    ]);
  });

  test("should merge yaml permissions anchors with definition", () => {
    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [],
      interfaces: [],
      permissions: {
        anchors: ["cli:*"],
      },
    });

    const config = resolve(
      def,
      {},
      {
        permissions: {
          anchors: ["mcp:stdio"],
        },
      },
    );

    // yaml anchors override definition anchors
    expect(config.permissions?.anchors).toEqual(["mcp:stdio"]);
  });

  test("should resolve @-prefixed values from package registry", () => {
    const configs: unknown[] = [];
    const factory: PluginFactory = (config) => {
      configs.push(config);
      return createMockPlugin("site-builder", config);
    };

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [["site-builder", factory, { outputDir: "./dist" }]],
      interfaces: [],
    });

    // Pre-register a mock package (same as runner/entrypoint would do)
    registerPackage("@brains/theme-test", "body { color: pink; }");

    const config = resolve(
      def,
      {},
      {
        plugins: {
          "site-builder": { themeCSS: "@brains/theme-test" },
        },
      },
    );

    const siteBuilder = config.plugins?.find((p) => p.id === "site-builder");
    expect(siteBuilder).toBeDefined();
    const resolvedConfig = getConfig(siteBuilder);
    expect(resolvedConfig["themeCSS"]).toBe("body { color: pink; }");
  });

  test("should leave non-@ values unchanged during package resolution", () => {
    const configs: unknown[] = [];
    const factory: PluginFactory = (config) => {
      configs.push(config);
      return createMockPlugin("webserver", config);
    };

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [["webserver", factory, {}]],
      interfaces: [],
    });

    const config = resolve(
      def,
      {},
      {
        plugins: {
          webserver: { port: 9090, title: "My Site" },
        },
      },
    );

    const webserver = config.plugins?.find((p) => p.id === "webserver");
    expect(getConfig(webserver)).toMatchObject({
      port: 9090,
      title: "My Site",
    });
  });
});

// --- site package resolution ---

function createMockSitePackage(
  pluginId: string,
  overrides?: Partial<SitePackage>,
): SitePackage {
  return {
    theme: "body { color: pink; }",
    layouts: { default: null },
    routes: [{ id: "home", path: "/", title: "Home" }],
    plugin: (config) => createMockPlugin(pluginId, config ?? {}),
    entityRouteConfig: { post: { label: "Post" } },
    ...overrides,
  };
}

describe("resolve with site package", () => {
  test("should use site from brain definition as default", () => {
    const [siteBuilderFactory] = createMockFactory("site-builder");
    const site = createMockSitePackage("personal-site");

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      site,
      capabilities: [["site-builder", siteBuilderFactory, {}]],
      interfaces: [],
    });

    const config = resolve(def, {});
    const pluginIds = config.plugins?.map((p) => p.id) ?? [];

    // Site plugin should be auto-registered
    expect(pluginIds).toContain("personal-site");
    // Site-builder should get theme injected
    const siteBuilder = config.plugins?.find((p) => p.id === "site-builder");
    expect(getConfig(siteBuilder)["themeCSS"]).toBe("body { color: pink; }");
  });

  test("should inject routes and entityRouteConfig into site-builder", () => {
    const [siteBuilderFactory] = createMockFactory("site-builder");
    const site = createMockSitePackage("personal-site", {
      routes: [
        { id: "home", path: "/", title: "Home" },
        { id: "about", path: "/about", title: "About" },
      ],
      entityRouteConfig: { post: { label: "Essay" } },
    });

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      site,
      capabilities: [["site-builder", siteBuilderFactory, {}]],
      interfaces: [],
    });

    const config = resolve(def, {});
    const siteBuilder = config.plugins?.find((p) => p.id === "site-builder");
    const sbConfig = getConfig(siteBuilder);

    expect(sbConfig["routes"]).toHaveLength(2);
    expect(sbConfig["entityRouteConfig"]).toEqual({ post: { label: "Essay" } });
  });

  test("should inject layouts into site-builder", () => {
    const [siteBuilderFactory] = createMockFactory("site-builder");
    const mockDefault = (): null => null;
    const mockMinimal = (): null => null;
    const site = createMockSitePackage("personal-site", {
      layouts: { default: mockDefault, minimal: mockMinimal },
    });

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      site,
      capabilities: [["site-builder", siteBuilderFactory, {}]],
      interfaces: [],
    });

    const config = resolve(def, {});
    const siteBuilder = config.plugins?.find((p) => p.id === "site-builder");
    const layouts = getConfig(siteBuilder)["layouts"] as Record<
      string,
      unknown
    >;

    expect(layouts["default"]).toBe(mockDefault);
    expect(layouts["minimal"]).toBe(mockMinimal);
  });

  test("should override brain definition site with brain.yaml site", () => {
    const [siteBuilderFactory] = createMockFactory("site-builder");
    const defaultSite = createMockSitePackage("professional-site", {
      theme: "body { color: blue; }",
    });
    const overrideSite = createMockSitePackage("personal-site", {
      theme: "body { color: pink; }",
    });

    // Register the override package
    registerPackage("@brains/site-override", overrideSite);

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      site: defaultSite,
      capabilities: [["site-builder", siteBuilderFactory, {}]],
      interfaces: [],
    });

    const config = resolve(def, {}, { site: "@brains/site-override" });
    const pluginIds = config.plugins?.map((p) => p.id) ?? [];

    // Override site plugin should be registered, not the default
    expect(pluginIds).toContain("personal-site");
    expect(pluginIds).not.toContain("professional-site");

    // Theme should come from override
    const siteBuilder = config.plugins?.find((p) => p.id === "site-builder");
    expect(getConfig(siteBuilder)["themeCSS"]).toBe("body { color: pink; }");
  });

  test("should allow brain.yaml site-builder overrides to win over site defaults", () => {
    const [siteBuilderFactory] = createMockFactory("site-builder");
    const site = createMockSitePackage("personal-site", {
      theme: "body { color: pink; }",
    });

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      site,
      capabilities: [["site-builder", siteBuilderFactory, {}]],
      interfaces: [],
    });

    const config = resolve(
      def,
      {},
      {
        plugins: { "site-builder": { cms: { enabled: true } } },
      },
    );

    const siteBuilder = config.plugins?.find((p) => p.id === "site-builder");
    const sbConfig = getConfig(siteBuilder);

    // Site defaults should still be present
    expect(sbConfig["themeCSS"]).toBe("body { color: pink; }");
    // Explicit overrides should also be present
    expect(sbConfig["cms"]).toEqual({ enabled: true });
  });

  test("should work without any site package", () => {
    const [siteBuilderFactory] = createMockFactory("site-builder");

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [
        ["site-builder", siteBuilderFactory, { themeCSS: "default" }],
      ],
      interfaces: [],
    });

    const config = resolve(def, {});
    const siteBuilder = config.plugins?.find((p) => p.id === "site-builder");

    // Should fall through to the base config
    expect(getConfig(siteBuilder)["themeCSS"]).toBe("default");
  });

  test("should parse site from brain.yaml", () => {
    const yaml = `
brain: "@brains/rover"
site: "@brains/site-mylittlephoney"
logLevel: debug
`;
    const result = parseInstanceOverrides(yaml);
    expect(result.site).toBe("@brains/site-mylittlephoney");
  });

  test("should pass entityRouteConfig to site plugin", () => {
    const [siteBuilderFactory] = createMockFactory("site-builder");
    const pluginConfigs: PluginConfig[] = [];
    const site: SitePackage = {
      theme: "",
      layouts: { default: null },
      routes: [],
      plugin: (config) => {
        const cfg = config ?? {};
        pluginConfigs.push(cfg);
        return createMockPlugin("personal-site", cfg);
      },
      entityRouteConfig: { post: { label: "Article" } },
    };

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      site,
      capabilities: [["site-builder", siteBuilderFactory, {}]],
      interfaces: [],
    });

    const config = resolve(def, {});

    expect(pluginConfigs).toHaveLength(1);
    const sitePlugin = config.plugins?.find((p) => p.id === "personal-site");
    expect(sitePlugin).toBeDefined();
    expect(getConfig(sitePlugin)["entityRouteConfig"]).toEqual({
      post: { label: "Article" },
    });
  });
});

// --- presets ---

describe("parseInstanceOverrides presets", () => {
  test("should parse preset field", () => {
    const yaml = `
brain: "@brains/rover"
preset: minimal
`;
    const result = parseInstanceOverrides(yaml);
    expect(result.preset).toBe("minimal");
  });

  test("should parse add list", () => {
    const yaml = `
brain: "@brains/rover"
preset: minimal
add:
  - discord
  - obsidian-vault
`;
    const result = parseInstanceOverrides(yaml);
    expect(result.add).toEqual(["discord", "obsidian-vault"]);
  });

  test("should parse remove list", () => {
    const yaml = `
brain: "@brains/rover"
preset: default
remove:
  - analytics
`;
    const result = parseInstanceOverrides(yaml);
    expect(result.remove).toEqual(["analytics"]);
  });

  test("should parse preset with add and remove together", () => {
    const yaml = `
brain: "@brains/rover"
preset: default
add:
  - obsidian-vault
remove:
  - analytics
`;
    const result = parseInstanceOverrides(yaml);
    expect(result.preset).toBe("default");
    expect(result.add).toEqual(["obsidian-vault"]);
    expect(result.remove).toEqual(["analytics"]);
  });
});

describe("resolve with presets", () => {
  test("should enable only preset IDs", () => {
    const [systemFactory] = createMockFactory("system");
    const [noteFactory] = createMockFactory("note");
    const [blogFactory] = createMockFactory("blog");

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      presets: {
        minimal: ["system", "note"],
      },
      capabilities: [
        ["system", systemFactory, {}],
        ["note", noteFactory, {}],
        ["blog", blogFactory, {}],
      ],
      interfaces: [],
    });

    const config = resolve(def, {}, { preset: "minimal" });
    const pluginIds = config.plugins?.map((p) => p.id) ?? [];

    expect(pluginIds).toContain("system");
    expect(pluginIds).toContain("note");
    expect(pluginIds).not.toContain("blog");
  });

  test("should use defaultPreset when no preset in overrides", () => {
    const [systemFactory] = createMockFactory("system");
    const [noteFactory] = createMockFactory("note");
    const [blogFactory] = createMockFactory("blog");

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      defaultPreset: "minimal",
      presets: {
        minimal: ["system", "note"],
      },
      capabilities: [
        ["system", systemFactory, {}],
        ["note", noteFactory, {}],
        ["blog", blogFactory, {}],
      ],
      interfaces: [],
    });

    const config = resolve(def, {});
    const pluginIds = config.plugins?.map((p) => p.id) ?? [];

    expect(pluginIds).toContain("system");
    expect(pluginIds).toContain("note");
    expect(pluginIds).not.toContain("blog");
  });

  test("should add IDs on top of preset", () => {
    const [systemFactory] = createMockFactory("system");
    const [noteFactory] = createMockFactory("note");
    const [blogFactory] = createMockFactory("blog");

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      presets: {
        minimal: ["system", "note"],
      },
      capabilities: [
        ["system", systemFactory, {}],
        ["note", noteFactory, {}],
        ["blog", blogFactory, {}],
      ],
      interfaces: [],
    });

    const config = resolve(def, {}, { preset: "minimal", add: ["blog"] });
    const pluginIds = config.plugins?.map((p) => p.id) ?? [];

    expect(pluginIds).toContain("system");
    expect(pluginIds).toContain("note");
    expect(pluginIds).toContain("blog");
  });

  test("should remove IDs from preset", () => {
    const [systemFactory] = createMockFactory("system");
    const [noteFactory] = createMockFactory("note");
    const [blogFactory] = createMockFactory("blog");

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      presets: {
        default: ["system", "note", "blog"],
      },
      capabilities: [
        ["system", systemFactory, {}],
        ["note", noteFactory, {}],
        ["blog", blogFactory, {}],
      ],
      interfaces: [],
    });

    const config = resolve(def, {}, { preset: "default", remove: ["blog"] });
    const pluginIds = config.plugins?.map((p) => p.id) ?? [];

    expect(pluginIds).toContain("system");
    expect(pluginIds).toContain("note");
    expect(pluginIds).not.toContain("blog");
  });

  test("should apply preset to interfaces too", () => {
    const [systemFactory] = createMockFactory("system");

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      presets: {
        minimal: ["system", "mcp"],
      },
      capabilities: [["system", systemFactory, {}]],
      interfaces: [
        [
          "mcp",
          MockMCP as InterfaceConstructor,
          (): PluginConfig => ({ port: 3333 }),
        ],
        [
          "chat",
          MockChat as InterfaceConstructor,
          (): PluginConfig => ({ botToken: "test-token" }),
        ],
      ],
    });

    const config = resolve(def, {}, { preset: "minimal" });
    const pluginIds = config.plugins?.map((p) => p.id) ?? [];

    expect(pluginIds).toContain("system");
    expect(pluginIds).toContain("mcp");
    expect(pluginIds).not.toContain("chat");
  });

  test("should ignore add IDs not in brain definition", () => {
    const [systemFactory] = createMockFactory("system");

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      presets: {
        minimal: ["system"],
      },
      capabilities: [["system", systemFactory, {}]],
      interfaces: [],
    });

    const config = resolve(
      def,
      {},
      { preset: "minimal", add: ["nonexistent"] },
    );
    const pluginIds = config.plugins?.map((p) => p.id) ?? [];

    expect(pluginIds).toContain("system");
    expect(pluginIds).not.toContain("nonexistent");
  });

  test("should register site plugin when site-builder is in preset", () => {
    const [siteBuilderFactory] = createMockFactory("site-builder");
    const site = createMockSitePackage("personal-site");

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      site,
      presets: {
        default: ["site-builder"],
      },
      capabilities: [["site-builder", siteBuilderFactory, {}]],
      interfaces: [],
    });

    const config = resolve(def, {});
    const pluginIds = config.plugins?.map((p) => p.id) ?? [];

    expect(pluginIds).toContain("site-builder");
    // site plugin is auto-registered alongside site-builder
    expect(pluginIds).toContain("personal-site");
  });

  test("should not register site plugin when site-builder is not in preset", () => {
    const [systemFactory] = createMockFactory("system");
    const [siteBuilderFactory] = createMockFactory("site-builder");
    const site = createMockSitePackage("personal-site");

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      site,
      presets: {
        minimal: ["system"],
        default: ["system", "site-builder"],
      },
      defaultPreset: "minimal",
      capabilities: [
        ["system", systemFactory, {}],
        ["site-builder", siteBuilderFactory, {}],
      ],
      interfaces: [],
    });

    const config = resolve(def, {}, { preset: "minimal" });
    const pluginIds = config.plugins?.map((p) => p.id) ?? [];

    expect(pluginIds).toContain("system");
    expect(pluginIds).not.toContain("site-builder");
    expect(pluginIds).not.toContain("personal-site");
  });

  test("should enable all when no presets defined", () => {
    const [systemFactory] = createMockFactory("system");
    const [blogFactory] = createMockFactory("blog");

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [
        ["system", systemFactory, {}],
        ["blog", blogFactory, {}],
      ],
      interfaces: [],
    });

    const config = resolve(def, {});
    const pluginIds = config.plugins?.map((p) => p.id) ?? [];

    expect(pluginIds).toContain("system");
    expect(pluginIds).toContain("blog");
  });
});

describe("resolve with mode: eval", () => {
  test("should remove evalDisable IDs when mode is eval", () => {
    const [systemFactory] = createMockFactory("system");
    const [blogFactory] = createMockFactory("blog");
    const [analyticsFactory] = createMockFactory("analytics");

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      presets: {
        default: ["system", "blog", "analytics"],
      },
      evalDisable: ["analytics"],
      capabilities: [
        ["system", systemFactory, {}],
        ["blog", blogFactory, {}],
        ["analytics", analyticsFactory, {}],
      ],
      interfaces: [],
    });

    const config = resolve(def, {}, { preset: "default", mode: "eval" });
    const pluginIds = config.plugins?.map((p) => p.id) ?? [];

    expect(pluginIds).toContain("system");
    expect(pluginIds).toContain("blog");
    expect(pluginIds).not.toContain("analytics");
  });

  test("should not remove evalDisable IDs when mode is not eval", () => {
    const [systemFactory] = createMockFactory("system");
    const [analyticsFactory] = createMockFactory("analytics");

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      presets: {
        default: ["system", "analytics"],
      },
      evalDisable: ["analytics"],
      capabilities: [
        ["system", systemFactory, {}],
        ["analytics", analyticsFactory, {}],
      ],
      interfaces: [],
    });

    const config = resolve(def, {}, { preset: "default" });
    const pluginIds = config.plugins?.map((p) => p.id) ?? [];

    expect(pluginIds).toContain("system");
    expect(pluginIds).toContain("analytics");
  });

  test("should apply evalDisable to interfaces too", () => {
    const [systemFactory] = createMockFactory("system");

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      presets: {
        default: ["system", "mcp", "chat"],
      },
      evalDisable: ["chat"],
      capabilities: [["system", systemFactory, {}]],
      interfaces: [
        [
          "mcp",
          MockMCP as InterfaceConstructor,
          (): PluginConfig => ({ port: 3333 }),
        ],
        [
          "chat",
          MockChat as InterfaceConstructor,
          (): PluginConfig => ({ botToken: "test-token" }),
        ],
      ],
    });

    const config = resolve(def, {}, { preset: "default", mode: "eval" });
    const pluginIds = config.plugins?.map((p) => p.id) ?? [];

    expect(pluginIds).toContain("system");
    expect(pluginIds).toContain("mcp");
    expect(pluginIds).not.toContain("chat");
  });

  test("should combine evalDisable with preset and add/remove", () => {
    const [systemFactory] = createMockFactory("system");
    const [blogFactory] = createMockFactory("blog");
    const [analyticsFactory] = createMockFactory("analytics");
    const [dashboardFactory] = createMockFactory("dashboard");

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      presets: {
        default: ["system", "blog", "analytics", "dashboard"],
      },
      evalDisable: ["analytics", "dashboard"],
      capabilities: [
        ["system", systemFactory, {}],
        ["blog", blogFactory, {}],
        ["analytics", analyticsFactory, {}],
        ["dashboard", dashboardFactory, {}],
      ],
      interfaces: [],
    });

    const config = resolve(
      def,
      {},
      { preset: "default", mode: "eval", add: ["dashboard"] },
    );
    const pluginIds = config.plugins?.map((p) => p.id) ?? [];

    // evalDisable removes analytics and dashboard, but add brings dashboard back
    expect(pluginIds).toContain("system");
    expect(pluginIds).toContain("blog");
    expect(pluginIds).not.toContain("analytics");
    // add happens after evalDisable, so dashboard comes back
    expect(pluginIds).toContain("dashboard");
  });

  test("should work without evalDisable defined", () => {
    const [systemFactory] = createMockFactory("system");
    const [blogFactory] = createMockFactory("blog");

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      presets: {
        default: ["system", "blog"],
      },
      capabilities: [
        ["system", systemFactory, {}],
        ["blog", blogFactory, {}],
      ],
      interfaces: [],
    });

    const config = resolve(def, {}, { preset: "default", mode: "eval" });
    const pluginIds = config.plugins?.map((p) => p.id) ?? [];

    expect(pluginIds).toContain("system");
    expect(pluginIds).toContain("blog");
  });
});

describe("parseInstanceOverrides with mode", () => {
  test("should parse mode: eval from yaml", () => {
    const yaml = `
brain: "@brains/rover"
preset: default
mode: eval
`;
    const overrides = parseInstanceOverrides(yaml);
    expect(overrides.mode).toBe("eval");
  });

  test("should leave mode undefined when not specified", () => {
    const yaml = `
brain: "@brains/rover"
preset: default
`;
    const overrides = parseInstanceOverrides(yaml);
    expect(overrides.mode).toBeUndefined();
  });
});

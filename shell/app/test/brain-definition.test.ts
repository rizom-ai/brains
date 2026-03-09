import { describe, expect, test } from "bun:test";
import {
  defineBrain,
  type BrainEnvironment,
  type PluginConfig,
  type PluginFactory,
} from "../src/brain-definition";
import { resolve } from "../src/brain-resolver";
import type { Plugin, IShell, PluginCapabilities } from "@brains/plugins";

// Minimal mock plugin factory
function createMockPluginFactory(
  id = "mock-plugin",
): PluginFactory & { lastConfig: PluginConfig | undefined } {
  const factory = ((config: PluginConfig): Plugin => {
    factory.lastConfig = config;
    return {
      id,
      version: "1.0.0",
      type: "service",
      packageName: id,
      register: async (_shell: IShell): Promise<PluginCapabilities> => ({
        tools: [],
        resources: [],
      }),
      config,
    } as Plugin;
  }) as PluginFactory & { lastConfig: PluginConfig | undefined };
  factory.lastConfig = undefined;
  return factory;
}

const mockPluginFactory = createMockPluginFactory();

// Minimal mock interface constructor — satisfies InterfaceConstructor
class MockInterface implements Plugin {
  public readonly id: string = "mock-interface";
  public readonly version: string = "1.0.0";
  public readonly description: string = "Mock interface";
  public readonly packageName: string = "mock-interface";
  public readonly type = "interface" as const;
  public config: PluginConfig;
  constructor(config: PluginConfig) {
    this.config = config;
  }
  async register(_shell: IShell): Promise<PluginCapabilities> {
    return { tools: [], resources: [] };
  }
}

describe("defineBrain", () => {
  test("should return the definition as-is", () => {
    const def = defineBrain({
      name: "test-brain",
      version: "1.0.0",
      capabilities: [],
      interfaces: [],
    });

    expect(def.name).toBe("test-brain");
    expect(def.version).toBe("1.0.0");
  });

  test("should accept full definition with all fields", () => {
    const def = defineBrain({
      name: "full-brain",
      version: "2.0.0",
      identity: {
        characterName: "TestBot",
        role: "Test assistant",
        purpose: "Testing",
        values: ["accuracy", "speed"],
      },
      capabilities: [[mockPluginFactory, { key: "value" }]],
      interfaces: [
        [MockInterface, (env: BrainEnvironment) => ({ token: env["TOKEN"] })],
      ],
      permissions: {
        anchors: ["test:user"],
        rules: [{ pattern: "test:*", level: "anchor" }],
      },
      deployment: {
        domain: "test.example.com",
      },
      contentModel: {
        seedContentDir: "./seed-content",
        entityRoutes: {
          post: { label: "Post" },
        },
      },
    });

    expect(def.identity?.characterName).toBe("TestBot");
    expect(def.capabilities).toHaveLength(1);
    expect(def.interfaces).toHaveLength(1);
    expect(def.permissions?.anchors).toEqual(["test:user"]);
  });
});

describe("resolve", () => {
  test("should create fresh plugin instances from factories", () => {
    const instances: Plugin[] = [];
    const trackingFactory: PluginFactory = (config) => {
      const plugin = mockPluginFactory(config);
      instances.push(plugin);
      return plugin;
    };

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [[trackingFactory, { a: 1 }]],
      interfaces: [],
    });

    resolve(def, {});
    resolve(def, {});

    // Two resolve calls should create two separate plugin instances
    expect(instances).toHaveLength(2);
  });

  test("should pass env to interface env mappers", () => {
    let capturedConfig: PluginConfig | undefined;

    class TrackingInterface extends MockInterface {
      constructor(config: PluginConfig) {
        super(config);
        capturedConfig = config;
      }
    }

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [],
      interfaces: [
        [
          TrackingInterface,
          (env: BrainEnvironment) => ({
            token: env["MY_TOKEN"],
            host: env["MY_HOST"],
          }),
        ],
      ],
    });

    resolve(def, { MY_TOKEN: "secret123", MY_HOST: "example.com" });

    expect(capturedConfig).toMatchObject({
      token: "secret123",
      host: "example.com",
    });
  });

  test("should resolve env-mapped capability configs", () => {
    const factory = createMockPluginFactory();

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [
        [
          factory,
          (env: BrainEnvironment) => ({
            repo: env["GIT_REPO"],
            token: env["GIT_TOKEN"],
          }),
        ],
      ],
      interfaces: [],
    });

    resolve(def, { GIT_REPO: "user/repo", GIT_TOKEN: "tok_123" });

    expect(factory.lastConfig).toMatchObject({
      repo: "user/repo",
      token: "tok_123",
    });
  });

  test("should map identity to AppConfig format", () => {
    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      identity: {
        characterName: "Atlas",
        role: "Knowledge manager",
        purpose: "Organize knowledge",
        values: ["clarity"],
      },
      capabilities: [],
      interfaces: [],
    });

    const config = resolve(def, {});

    expect(config.identity).toEqual({
      name: "Atlas",
      role: "Knowledge manager",
      purpose: "Organize knowledge",
      values: ["clarity"],
    });
  });

  test("should extract AI keys from environment", () => {
    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [],
      interfaces: [],
    });

    const config = resolve(def, {
      ANTHROPIC_API_KEY: "sk-ant-123",
      OPENAI_API_KEY: "sk-oai-456",
    });

    expect(config.aiApiKey).toBe("sk-ant-123");
    expect(config.openaiApiKey).toBe("sk-oai-456");
  });

  test("should merge brain.yaml overrides into interface config before validation", () => {
    // Regression: interfaces whose constructors run Zod validation with
    // required fields would crash before overrides were merged.
    let capturedConfig: PluginConfig | undefined;

    class ValidatingInterface extends MockInterface {
      override readonly id = "validating";
      override readonly packageName = "validating";
      constructor(config: PluginConfig) {
        super(config);
        if (!config["homeserver"]) {
          throw new Error("homeserver is required");
        }
        capturedConfig = config;
      }
    }

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [],
      interfaces: [
        [
          ValidatingInterface,
          (env: BrainEnvironment) => ({ accessToken: env["TOKEN"] ?? "" }),
        ],
      ],
    });

    // Should not throw — overrides provide the required homeserver field
    const config = resolve(
      def,
      { TOKEN: "secret" },
      {
        plugins: {
          validating: {
            homeserver: "https://example.com",
            userId: "@bot:example.com",
          },
        },
      },
    );

    expect(config.plugins?.find((p) => p.id === "validating")).toBeDefined();
    expect(capturedConfig?.["homeserver"]).toBe("https://example.com");
    expect(capturedConfig?.["accessToken"]).toBe("secret");
  });

  test("should merge brain.yaml overrides into capability config before validation", () => {
    const validatingCapFactory: PluginFactory = (config) => {
      if (!config["repo"]) {
        throw new Error("repo is required");
      }
      return createMockPluginFactory("validating-cap")(config);
    };

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [
        [
          validatingCapFactory,
          (env: BrainEnvironment) => ({ token: env["TOKEN"] ?? "" }),
        ],
      ],
      interfaces: [],
    });

    const config = resolve(
      def,
      { TOKEN: "tok" },
      {
        plugins: {
          "validating-cap": { repo: "user/repo" },
        },
      },
    );

    expect(
      config.plugins?.find((p) => p.id === "validating-cap"),
    ).toBeDefined();
  });

  test("should disable interfaces via disable list", () => {
    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [],
      interfaces: [[MockInterface, () => ({})]],
    });

    const config = resolve(def, {}, { disable: ["mock-interface"] });

    expect(
      config.plugins?.find((p) => p.id === "mock-interface"),
    ).toBeUndefined();
  });

  test("should pass through permissions and deployment", () => {
    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [],
      interfaces: [],
      permissions: {
        anchors: ["matrix:@user:server"],
        rules: [{ pattern: "mcp:*", level: "anchor" }],
      },
      deployment: {
        domain: "example.com",
        cdn: { enabled: true, provider: "bunny" },
      },
    });

    const config = resolve(def, {});

    expect(config.permissions?.anchors).toEqual(["matrix:@user:server"]);
    expect(config.deployment?.domain).toBe("example.com");
  });
});

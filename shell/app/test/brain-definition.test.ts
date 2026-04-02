import { describe, expect, test } from "bun:test";
import {
  defineBrain,
  type BrainEnvironment,
  type PluginConfig,
  type PluginFactory,
} from "../src/brain-definition";
import { resolve } from "../src/brain-resolver";
import type { Plugin, IShell, PluginCapabilities } from "@brains/plugins";
import { z } from "@brains/utils";

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
      capabilities: [["mock", mockPluginFactory, { key: "value" }]],
      interfaces: [
        [
          "mock-interface",
          MockInterface,
          (env: BrainEnvironment): PluginConfig => ({ token: env["TOKEN"] }),
        ],
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
      capabilities: [["mock", trackingFactory, { a: 1 }]],
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
          "mock-interface",
          TrackingInterface,
          (env: BrainEnvironment): PluginConfig => ({
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
          "mock",
          factory,
          (env: BrainEnvironment): PluginConfig => ({
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
      AI_API_KEY: "sk-test-123",
      AI_IMAGE_KEY: "sk-img-456",
    });

    expect(config.aiApiKey).toBe("sk-test-123");
    expect(config.aiImageKey).toBe("sk-img-456");
  });

  test("should resolve model and provider from overrides", () => {
    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [],
      interfaces: [],
    });

    const config = resolve(
      def,
      { AI_API_KEY: "sk-test" },
      { model: "gpt-4o-mini" },
    );

    expect(config.aiModel).toBe("gpt-4o-mini");
  });

  test("should apply targeted override to interface after construction", () => {
    let capturedConfig: PluginConfig | undefined;

    class ConfigCapture extends MockInterface {
      override readonly id = "config-capture";
      override readonly packageName = "config-capture";
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
          "config-capture",
          ConfigCapture,
          (env: BrainEnvironment): PluginConfig => ({
            accessToken: env["TOKEN"] ?? "",
          }),
        ],
      ],
    });

    const config = resolve(
      def,
      { TOKEN: "secret" },
      {
        plugins: {
          "config-capture": {
            homeserver: "https://example.com",
            userId: "@bot:example.com",
          },
        },
      },
    );

    expect(
      config.plugins?.find((p) => p.id === "config-capture"),
    ).toBeDefined();
    expect(capturedConfig?.["homeserver"]).toBe("https://example.com");
    expect(capturedConfig?.["accessToken"]).toBe("secret");
  });

  test("should apply targeted override to capability after construction", () => {
    let capturedConfig: PluginConfig | undefined;
    const capFactory: PluginFactory = (config) => {
      capturedConfig = config;
      return createMockPluginFactory("my-cap")(config);
    };

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [
        [
          "my-cap",
          capFactory,
          (env: BrainEnvironment): PluginConfig => ({
            token: env["TOKEN"] ?? "",
          }),
        ],
      ],
      interfaces: [],
    });

    const config = resolve(
      def,
      { TOKEN: "tok" },
      {
        plugins: {
          "my-cap": { repo: "user/repo" },
        },
      },
    );

    expect(config.plugins?.find((p) => p.id === "my-cap")).toBeDefined();
    expect(capturedConfig?.["repo"]).toBe("user/repo");
    expect(capturedConfig?.["token"]).toBe("tok");
  });

  test("should exclude interfaces not in preset", () => {
    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      presets: { minimal: [] },
      capabilities: [],
      interfaces: [["mock-interface", MockInterface, (): PluginConfig => ({})]],
    });

    const config = resolve(def, {}, { preset: "minimal" });

    expect(
      config.plugins?.find((p) => p.id === "mock-interface"),
    ).toBeUndefined();
  });

  test("should skip interface when env mapper returns null", () => {
    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [],
      interfaces: [
        [
          "mock-interface",
          MockInterface,
          (_env: BrainEnvironment): PluginConfig | null => null,
        ],
      ],
    });

    const config = resolve(def, {});

    expect(
      config.plugins?.find((p) => p.id === "mock-interface"),
    ).toBeUndefined();
  });

  test("should skip interface gracefully when config fails Zod validation", () => {
    const requiredTokenSchema = z.object({
      botToken: z.string().min(1),
    });

    class ValidatingInterface extends MockInterface {
      override readonly id = "validating";
      override readonly packageName = "validating";
      constructor(config: PluginConfig) {
        requiredTokenSchema.parse(config); // throws ZodError
        super(config);
      }
    }

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [],
      interfaces: [
        [
          "validating",
          ValidatingInterface,
          (): PluginConfig => ({}), // no botToken — ZodError
        ],
      ],
    });

    const config = resolve(def, {});

    expect(config.plugins?.find((p) => p.id === "validating")).toBeUndefined();
    expect(config.plugins).toBeDefined();
  });

  test("should rethrow non-Zod errors from interface constructor", () => {
    class BuggyInterface extends MockInterface {
      override readonly id = "buggy";
      constructor(config: PluginConfig) {
        super(config);
        throw new TypeError("unexpected null reference");
      }
    }

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [],
      interfaces: [["buggy", BuggyInterface, (): PluginConfig => ({})]],
    });

    expect(() => resolve(def, {})).toThrow("unexpected null reference");
  });

  test("should skip capability gracefully when config fails Zod validation", () => {
    const requiredKeySchema = z.object({
      apiKey: z.string().min(1),
    });

    const validatingFactory: PluginFactory = (config) => {
      requiredKeySchema.parse(config); // throws ZodError
      return createMockPluginFactory("needs-key")(config);
    };

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [
        ["needs-key", validatingFactory, {}],
        ["good-plugin", createMockPluginFactory("good-plugin"), { ok: true }],
      ],
      interfaces: [],
    });

    const config = resolve(def, {});

    expect(config.plugins?.find((p) => p.id === "needs-key")).toBeUndefined();
    expect(config.plugins?.find((p) => p.id === "good-plugin")).toBeDefined();
  });

  test("should rethrow non-Zod errors from capability factory", () => {
    const buggyFactory: PluginFactory = () => {
      throw new RangeError("stack overflow");
    };

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [["buggy", buggyFactory, {}]],
      interfaces: [],
    });

    expect(() => resolve(def, {})).toThrow("stack overflow");
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

import { describe, expect, test } from "bun:test";
import {
  defineBrain,
  type BrainEnvironment,
  type InterfaceConstructor,
} from "../src/brain-definition";
import { resolve } from "../src/brain-resolver";
import type { Plugin } from "@brains/plugins";

// Minimal mock plugin factory
const mockPluginFactory = (config: unknown): Plugin =>
  ({
    id: "mock-plugin",
    version: "1.0.0",
    description: "Mock plugin",
    packageName: "mock-plugin",
    type: "service",
    register: async (): Promise<void> => {},
    config,
  }) as unknown as Plugin;

// Minimal mock interface constructor
class MockInterface {
  public readonly id = "mock-interface";
  public readonly version = "1.0.0";
  public readonly description = "Mock interface";
  public readonly packageName = "mock-interface";
  public readonly type = "interface";
  public config: unknown;
  constructor(config: unknown) {
    this.config = config;
  }
  async register(): Promise<void> {}
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
        [
          MockInterface as unknown as InterfaceConstructor,
          (env: BrainEnvironment) => ({ token: env["TOKEN"] }),
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
    const trackingFactory = (config: unknown): Plugin => {
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
    let capturedConfig: unknown;

    class TrackingInterface extends MockInterface {
      constructor(config: unknown) {
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
          TrackingInterface as unknown as InterfaceConstructor,
          (env: BrainEnvironment) => ({
            token: env["MY_TOKEN"],
            host: env["MY_HOST"],
          }),
        ],
      ],
    });

    resolve(def, { MY_TOKEN: "secret123", MY_HOST: "example.com" });

    expect(capturedConfig).toEqual({
      token: "secret123",
      host: "example.com",
    });
  });

  test("should resolve env-mapped capability configs", () => {
    let capturedConfig: unknown;

    const trackingFactory = (config: unknown): Plugin => {
      capturedConfig = config;
      return mockPluginFactory(config);
    };

    const def = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [
        [
          trackingFactory,
          (env: BrainEnvironment) => ({
            repo: env["GIT_REPO"],
            token: env["GIT_TOKEN"],
          }),
        ],
      ],
      interfaces: [],
    });

    resolve(def, { GIT_REPO: "user/repo", GIT_TOKEN: "tok_123" });

    expect(capturedConfig).toEqual({
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

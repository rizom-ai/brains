import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, rmSync, existsSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { parseBrainYaml } from "../src/lib/brain-yaml";
import { resolveProvider, getRequiredEnvVar } from "../src/lib/provider";

describe("parseBrainYaml AI model field", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "brain-yaml-provider-test-"));
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should parse model field from brain.yaml", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      "brain: brain\nbundles: [core]\nmodel: gpt-4o-mini\n",
    );
    const config = parseBrainYaml(testDir);
    expect(config.model).toBe("gpt-4o-mini");
  });

  it("should have no model when not specified", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      "brain: brain\nbundles: [core]\n",
    );
    const config = parseBrainYaml(testDir);
    expect(config.model).toBeUndefined();
  });

  it("should parse model with explicit prefix", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      "brain: brain\nbundles: [core]\nmodel: anthropic:claude-haiku-4-5-20251001\n",
    );
    const config = parseBrainYaml(testDir);
    expect(config.model).toBe("anthropic:claude-haiku-4-5-20251001");
  });

  it("should parse quoted brain name", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      'brain: "brain"\nbundles: [core]\n',
    );
    const config = parseBrainYaml(testDir);
    expect(config.brain).toBe("brain");
    expect(config.bundles).toEqual(["core"]);
  });

  // The CLI validates with the same schema the runtime boots with, so a
  // file the CLI accepts cannot fail at boot (and vice versa).
  it("rejects a file the runtime would reject at boot", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      "brain: rover\npreset: everything\n",
    );
    expect(() => parseBrainYaml(testDir)).toThrow(/config migrate/);
  });

  it("accepts the full runtime override surface", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      [
        "brain: brain",
        "bundles:",
        "  - core",
        "domain: example.com",
        "add:",
        "  - docs",
        "remove:",
        "  - chat",
        "permissions:",
        "  rules:",
        '    - pattern: "slack:*"',
        "      level: public",
        "plugins:",
        "  directory-sync:",
        "    autoSync: true",
        "",
      ].join("\n"),
    );
    const config = parseBrainYaml(testDir);
    expect(config.domain).toBe("example.com");
    expect(config.add).toEqual(["docs"]);
    expect(config.permissions?.rules?.[0]?.level).toBe("public");
  });

  it("should handle comments in yaml", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      "brain: brain # canonical definition\nbundles: [core]\n# model: gpt-4o-mini\n",
    );
    const config = parseBrainYaml(testDir);
    expect(config.brain).toBe("brain");
    expect(config.bundles).toEqual(["core"]);
    expect(config.model).toBeUndefined();
  });

  it("should parse external plugin declarations", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      `brain: brain
bundles: [core]
plugins:
  calendar:
    package: "@rizom/brain-plugin-calendar"
    config:
      timezone: UTC
`,
    );
    const config = parseBrainYaml(testDir);
    expect(config.plugins?.["calendar"]).toEqual({
      package: "@rizom/brain-plugin-calendar",
      config: {
        timezone: "UTC",
      },
    });
  });

  it("should reject list-form plugins", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      `brain: brain
bundles: [core]
plugins:
  - package: "@rizom/brain-plugin-calendar"
`,
    );
    expect(() => parseBrainYaml(testDir)).toThrow("Invalid brain.yaml");
  });

  it("should require explicit bundles for an empty canonical config", () => {
    writeFileSync(join(testDir, "brain.yaml"), "");
    expect(() => parseBrainYaml(testDir)).toThrow("Invalid brain.yaml");
  });

  it("should default an omitted brain field when bundles are explicit", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      "bundles: [core]\nmodel: gpt-4o-mini\n",
    );
    expect(parseBrainYaml(testDir)).toMatchObject({
      brain: "brain",
      bundles: ["core"],
      model: "gpt-4o-mini",
    });
  });
});

describe("resolveProvider", () => {
  describe("auto-detection from model name", () => {
    it("should detect openai from gpt models", () => {
      expect(resolveProvider("gpt-4o-mini")).toEqual({
        provider: "openai",
        modelId: "gpt-4o-mini",
      });
    });

    it("should detect openai from o1 models", () => {
      expect(resolveProvider("o1-mini")).toEqual({
        provider: "openai",
        modelId: "o1-mini",
      });
    });

    it("should detect openai from o3 models", () => {
      expect(resolveProvider("o3-mini")).toEqual({
        provider: "openai",
        modelId: "o3-mini",
      });
    });

    it("should detect anthropic from claude models", () => {
      expect(resolveProvider("claude-haiku-4-5-20251001")).toEqual({
        provider: "anthropic",
        modelId: "claude-haiku-4-5-20251001",
      });
    });

    it("should detect anthropic from claude-3 models", () => {
      expect(resolveProvider("claude-3-5-sonnet-20241022")).toEqual({
        provider: "anthropic",
        modelId: "claude-3-5-sonnet-20241022",
      });
    });

    it("should detect google from gemini models", () => {
      expect(resolveProvider("gemini-2.0-flash")).toEqual({
        provider: "google",
        modelId: "gemini-2.0-flash",
      });
    });

    it("should detect google from gemini-pro models", () => {
      expect(resolveProvider("gemini-1.5-pro")).toEqual({
        provider: "google",
        modelId: "gemini-1.5-pro",
      });
    });

    it("should detect ollama from llama models", () => {
      expect(resolveProvider("llama3.2")).toEqual({
        provider: "ollama",
        modelId: "llama3.2",
      });
    });

    it("should detect ollama from mistral models", () => {
      expect(resolveProvider("mistral-7b")).toEqual({
        provider: "ollama",
        modelId: "mistral-7b",
      });
    });

    it("should detect ollama from phi models", () => {
      expect(resolveProvider("phi-3")).toEqual({
        provider: "ollama",
        modelId: "phi-3",
      });
    });

    it("should detect ollama from qwen models", () => {
      expect(resolveProvider("qwen2.5")).toEqual({
        provider: "ollama",
        modelId: "qwen2.5",
      });
    });

    it("should default to openai for unknown model names", () => {
      expect(resolveProvider("some-custom-model")).toEqual({
        provider: "openai",
        modelId: "some-custom-model",
      });
    });
  });

  describe("explicit prefix", () => {
    it("should parse openai: prefix", () => {
      expect(resolveProvider("openai:gpt-4o-mini")).toEqual({
        provider: "openai",
        modelId: "gpt-4o-mini",
      });
    });

    it("should parse anthropic: prefix", () => {
      expect(resolveProvider("anthropic:claude-haiku-4-5-20251001")).toEqual({
        provider: "anthropic",
        modelId: "claude-haiku-4-5-20251001",
      });
    });

    it("should parse google: prefix", () => {
      expect(resolveProvider("google:gemini-2.0-flash")).toEqual({
        provider: "google",
        modelId: "gemini-2.0-flash",
      });
    });

    it("should parse ollama: prefix", () => {
      expect(resolveProvider("ollama:llama3.2")).toEqual({
        provider: "ollama",
        modelId: "llama3.2",
      });
    });

    it("should support any provider via prefix", () => {
      expect(resolveProvider("groq:llama-3.1-70b")).toEqual({
        provider: "groq",
        modelId: "llama-3.1-70b",
      });
    });

    it("should support custom/local providers via prefix", () => {
      expect(resolveProvider("lmstudio:my-local-model")).toEqual({
        provider: "lmstudio",
        modelId: "my-local-model",
      });
    });

    it("should override auto-detection when prefix is explicit", () => {
      // llama would auto-detect as ollama, but explicit prefix wins
      expect(resolveProvider("openai:llama3.2")).toEqual({
        provider: "openai",
        modelId: "llama3.2",
      });
    });
  });
});

describe("getRequiredEnvVar", () => {
  it("should return AI_API_KEY for openai", () => {
    expect(getRequiredEnvVar("openai")).toBe("AI_API_KEY");
  });

  it("should return AI_API_KEY for anthropic", () => {
    expect(getRequiredEnvVar("anthropic")).toBe("AI_API_KEY");
  });

  it("should return AI_API_KEY for google", () => {
    expect(getRequiredEnvVar("google")).toBe("AI_API_KEY");
  });

  it("should return undefined for ollama (no key needed)", () => {
    expect(getRequiredEnvVar("ollama")).toBeUndefined();
  });

  it("should return undefined for unknown providers", () => {
    expect(getRequiredEnvVar("groq")).toBeUndefined();
    expect(getRequiredEnvVar("lmstudio")).toBeUndefined();
  });
});

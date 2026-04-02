import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { parseBrainYaml } from "../src/lib/brain-yaml";
import { resolveProvider, getRequiredEnvVar } from "../src/lib/provider";

describe("parseBrainYaml model field", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `brain-yaml-provider-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should parse model field from brain.yaml", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      "brain: rover\nmodel: gpt-4o-mini\n",
    );
    const config = parseBrainYaml(testDir);
    expect(config.model).toBe("gpt-4o-mini");
  });

  it("should have no model when not specified", () => {
    writeFileSync(join(testDir, "brain.yaml"), "brain: rover\n");
    const config = parseBrainYaml(testDir);
    expect(config.model).toBeUndefined();
  });

  it("should parse model with explicit prefix", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      "brain: rover\nmodel: anthropic:claude-haiku-4-5-20251001\n",
    );
    const config = parseBrainYaml(testDir);
    expect(config.model).toBe("anthropic:claude-haiku-4-5-20251001");
  });

  it("should parse quoted brain name", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      'brain: "rover"\npreset: minimal\n',
    );
    const config = parseBrainYaml(testDir);
    expect(config.brain).toBe("rover");
    expect(config.preset).toBe("minimal");
  });

  it("should handle comments in yaml", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      "brain: rover # my brain\n# model: gpt-4o-mini\npreset: pro\n",
    );
    const config = parseBrainYaml(testDir);
    expect(config.brain).toBe("rover");
    expect(config.preset).toBe("pro");
    expect(config.model).toBeUndefined();
  });

  it("should throw for empty yaml", () => {
    writeFileSync(join(testDir, "brain.yaml"), "");
    expect(() => parseBrainYaml(testDir)).toThrow("brain");
  });

  it("should throw for yaml without brain field", () => {
    writeFileSync(join(testDir, "brain.yaml"), "model: gpt-4o-mini\n");
    expect(() => parseBrainYaml(testDir)).toThrow("brain");
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

import { describe, it, expect } from "bun:test";
import { checkApiKey, checkBunVersion } from "../src/lib/preflight";

describe("checkApiKey", () => {
  it("should pass when AI_API_KEY is set", () => {
    const result = checkApiKey({ AI_API_KEY: "sk-test" });
    expect(result.ok).toBe(true);
  });

  it("should fail when AI_API_KEY is missing", () => {
    const result = checkApiKey({});
    expect(result.ok).toBe(false);
    expect(result.message).toContain("AI_API_KEY");
  });

  it("should fail when AI_API_KEY is empty string", () => {
    const result = checkApiKey({ AI_API_KEY: "" });
    expect(result.ok).toBe(false);
  });

  it("should fail when AI_API_KEY is whitespace", () => {
    const result = checkApiKey({ AI_API_KEY: "  " });
    expect(result.ok).toBe(false);
  });
});

describe("checkApiKey for a brain on the model runtime", () => {
  const local = {
    model: "local:qwen3:8b",
    embeddingModel: "local:embeddinggemma-2:270m",
  };

  it("needs no key when its text and embedding models are both local", () => {
    expect(checkApiKey({}, local).ok).toBe(true);
  });

  it("still needs the key when either model comes from a cloud provider", () => {
    expect(checkApiKey({}, { ...local, model: "gpt-6-luna" }).ok).toBe(false);
    expect(checkApiKey({}, { ...local, embeddingModel: undefined }).ok).toBe(
      false,
    );
    expect(checkApiKey({}, { embeddingModel: local.embeddingModel }).ok).toBe(
      false,
    );
  });
});

describe("checkBunVersion", () => {
  it("should pass for valid version", () => {
    const result = checkBunVersion("1.3.3");
    expect(result.ok).toBe(true);
  });

  it("should pass for higher version", () => {
    const result = checkBunVersion("1.4.0");
    expect(result.ok).toBe(true);
  });

  it("should fail for lower version", () => {
    const result = checkBunVersion("1.2.0");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("1.3.3");
  });

  it("should pass for major version bump", () => {
    const result = checkBunVersion("2.0.0");
    expect(result.ok).toBe(true);
  });

  it("should fail for old patch", () => {
    const result = checkBunVersion("1.3.2");
    expect(result.ok).toBe(false);
  });
});

import { describe, expect, it } from "bun:test";
import {
  keyMismatchWarning,
  PROVIDERS,
  readProviderKeys,
} from "../src/providers";
import { isSupportedTextModel } from "../src/provider-selection";

describe("provider keys", () => {
  it("reads each provider's key from its own variable", () => {
    expect(
      readProviderKeys({
        OPENAI_API_KEY: "sk-proj-abc",
        ANTHROPIC_API_KEY: "sk-ant-abc",
        GOOGLE_GENERATIVE_AI_API_KEY: "AIzaabc",
      }),
    ).toEqual({
      openai: "sk-proj-abc",
      anthropic: "sk-ant-abc",
      google: "AIzaabc",
    });
  });

  it("leaves a blank variable unset", () => {
    expect(
      readProviderKeys({ OPENAI_API_KEY: "  ", ANTHROPIC_API_KEY: "" }),
    ).toEqual({});
  });

  it("never reads the single legacy key", () => {
    expect(
      readProviderKeys({ AI_API_KEY: "sk-proj-abc", AI_IMAGE_KEY: "AIzaabc" }),
    ).toEqual({});
  });

  it("names the model runtime's setting instead of a key variable", () => {
    expect(PROVIDERS.local.keyEnvVar).toBeUndefined();
  });
});

describe("key hints", () => {
  it("says when a key looks like another provider's", () => {
    expect(keyMismatchWarning("openai", "sk-ant-api03-abc")).toBe(
      "OPENAI_API_KEY looks like an Anthropic key.",
    );
    expect(keyMismatchWarning("anthropic", "AIzaSyabc")).toBe(
      "ANTHROPIC_API_KEY looks like a Google key.",
    );
  });

  it("accepts any key whose format it does not recognize", () => {
    expect(keyMismatchWarning("openai", "sk-None-abc")).toBeUndefined();
    expect(keyMismatchWarning("openai", "sk-or-v1-abc")).toBeUndefined();
    expect(keyMismatchWarning("google", "unrecognized")).toBeUndefined();
  });

  it("accepts a key in its own provider's format", () => {
    expect(keyMismatchWarning("anthropic", "sk-ant-api03-abc")).toBeUndefined();
    expect(keyMismatchWarning("openai", "sk-proj-abc")).toBeUndefined();
  });
});

describe("text providers", () => {
  it("are the providers in the table", () => {
    expect(isSupportedTextModel("anthropic:claude-sonnet-5")).toBe(true);
    expect(isSupportedTextModel("local:qwen3:4b")).toBe(true);
    expect(isSupportedTextModel("mystery:model")).toBe(false);
  });
});

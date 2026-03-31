import { describe, it, expect } from "bun:test";
import {
  resolveModelName,
  getAvailableModels,
} from "../src/lib/model-registry";

describe("model registry", () => {
  it("should normalize @brains/rover to rover", () => {
    expect(resolveModelName("@brains/rover")).toBe("rover");
  });

  it("should pass through bare model name", () => {
    expect(resolveModelName("rover")).toBe("rover");
  });

  it("should normalize quoted package name", () => {
    expect(resolveModelName('"@brains/rover"')).toBe("rover");
  });

  it("should list available models", () => {
    const models = getAvailableModels();
    expect(models).toContain("rover");
    expect(models).toContain("ranger");
    expect(models).toContain("relay");
  });

  it("should accept both old and new yaml format", () => {
    // Old: brain: "@brains/rover"
    expect(resolveModelName("@brains/rover")).toBe("rover");
    // New: brain: rover
    expect(resolveModelName("rover")).toBe("rover");
  });
});

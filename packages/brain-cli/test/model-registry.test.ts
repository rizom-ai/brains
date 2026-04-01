import { describe, it, expect, beforeEach } from "bun:test";
import {
  resolveModelName,
  getAvailableModels,
  isBuiltinModel,
  registerModel,
  getModel,
  resetModels,
} from "../src/lib/model-registry";

describe("model name resolution", () => {
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
    expect(resolveModelName("@brains/rover")).toBe("rover");
    expect(resolveModelName("rover")).toBe("rover");
  });
});

describe("model registration", () => {
  beforeEach(() => {
    resetModels();
  });

  it("should return undefined for unregistered model", () => {
    expect(getModel("rover")).toBeUndefined();
  });

  it("should register and retrieve a model definition", () => {
    const definition = { name: "rover", version: "1.0.0" };
    registerModel("rover", definition);
    expect(getModel("rover")).toBe(definition);
  });

  it("should register multiple models", () => {
    const rover = { name: "rover" };
    const ranger = { name: "ranger" };
    registerModel("rover", rover);
    registerModel("ranger", ranger);
    expect(getModel("rover")).toBe(rover);
    expect(getModel("ranger")).toBe(ranger);
  });

  it("should report registered model as built-in", () => {
    expect(isBuiltinModel("rover")).toBe(true);
  });

  it("should report unknown model as not built-in", () => {
    expect(isBuiltinModel("custom")).toBe(false);
  });

  it("should check if model definition is registered", () => {
    expect(getModel("rover")).toBeUndefined();
    registerModel("rover", { name: "rover" });
    expect(getModel("rover")).toBeDefined();
  });
});

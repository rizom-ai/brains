import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { interpolateEnvVar, interpolateEnv } from "./string-utils";

describe("interpolateEnvVar", () => {
  beforeEach(() => {
    process.env["TEST_VAR"] = "hello";
    process.env["TEST_VAR_2"] = "world";
  });

  afterEach(() => {
    delete process.env["TEST_VAR"];
    delete process.env["TEST_VAR_2"];
  });

  it("should return string unchanged when no env var references", () => {
    expect(interpolateEnvVar("plain string")).toBe("plain string");
  });

  it("should resolve a single env var", () => {
    expect(interpolateEnvVar("${TEST_VAR}")).toBe("hello");
  });

  it("should resolve multiple env vars", () => {
    expect(interpolateEnvVar("${TEST_VAR} ${TEST_VAR_2}")).toBe("hello world");
  });

  it("should resolve env var embedded in string", () => {
    expect(interpolateEnvVar("sk-${TEST_VAR}-key")).toBe("sk-hello-key");
  });

  it("should return undefined when env var is not set", () => {
    expect(interpolateEnvVar("${MISSING_VAR}")).toBeUndefined();
  });

  it("should return undefined when any env var is missing", () => {
    expect(interpolateEnvVar("${TEST_VAR}-${MISSING_VAR}")).toBeUndefined();
  });
});

describe("interpolateEnv", () => {
  beforeEach(() => {
    process.env["TEST_KEY"] = "sk-secret";
    process.env["TEST_TOKEN"] = "tok-123";
  });

  afterEach(() => {
    delete process.env["TEST_KEY"];
    delete process.env["TEST_TOKEN"];
  });

  it("should interpolate string values in objects", () => {
    const result = interpolateEnv({
      openai: "${TEST_KEY}",
      anthropic: "${TEST_TOKEN}",
    });
    expect(result).toEqual({
      openai: "sk-secret",
      anthropic: "tok-123",
    });
  });

  it("should pass through literal strings unchanged", () => {
    const result = interpolateEnv({
      openai: "sk-literal",
    });
    expect(result).toEqual({ openai: "sk-literal" });
  });

  it("should remove entries where env var is not set", () => {
    const result = interpolateEnv({
      openai: "${TEST_KEY}",
      missing: "${NOPE}",
    });
    expect(result).toEqual({ openai: "sk-secret" });
  });

  it("should interpolate object keys", () => {
    const result = interpolateEnv({
      "${TEST_TOKEN}": "some-value",
    });
    expect(result).toEqual({ "tok-123": "some-value" });
  });

  it("should interpolate arrays", () => {
    const result = interpolateEnv(["${TEST_KEY}", "literal", "${NOPE}"]);
    expect(result).toEqual(["sk-secret", "literal"]);
  });

  it("should handle nested objects", () => {
    const result = interpolateEnv({
      keys: {
        openai: "${TEST_KEY}",
      },
    });
    expect(result).toEqual({ keys: { openai: "sk-secret" } });
  });

  it("should pass through non-string primitives", () => {
    expect(interpolateEnv(42)).toBe(42);
    expect(interpolateEnv(true)).toBe(true);
    expect(interpolateEnv(null)).toBeNull();
  });
});

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { parseArgs } from "../src/parse-args";
import { resolveRemoteUrl, resolveToken } from "../src/lib/remote-config";

describe("parseArgs remote flags", () => {
  it("should parse --remote flag", () => {
    const result = parseArgs(["list", "post", "--remote", "rover.rizom.ai"]);
    expect(result.command).toBe("list");
    expect(result.args).toEqual(["post"]);
    expect(result.flags.remote).toBe("rover.rizom.ai");
  });

  it("should parse --token flag", () => {
    const result = parseArgs([
      "status",
      "--remote",
      "rover.rizom.ai",
      "--token",
      "secret123",
    ]);
    expect(result.command).toBe("status");
    expect(result.flags.remote).toBe("rover.rizom.ai");
    expect(result.flags.token).toBe("secret123");
  });

  it("should not set remote when flag is absent", () => {
    const result = parseArgs(["list", "post"]);
    expect(result.flags.remote).toBeUndefined();
    expect(result.flags.token).toBeUndefined();
  });

  it("should keep positional args separate from remote flag", () => {
    const result = parseArgs([
      "get",
      "post",
      "my-post",
      "--remote",
      "rover.rizom.ai",
    ]);
    expect(result.command).toBe("get");
    expect(result.args).toEqual(["post", "my-post"]);
    expect(result.flags.remote).toBe("rover.rizom.ai");
  });
});

describe("resolveRemoteUrl", () => {
  it("should add https:// and /mcp to bare domain", () => {
    expect(resolveRemoteUrl("rover.rizom.ai")).toBe(
      "https://rover.rizom.ai/mcp",
    );
  });

  it("should add /mcp to URL with protocol", () => {
    expect(resolveRemoteUrl("https://rover.rizom.ai")).toBe(
      "https://rover.rizom.ai/mcp",
    );
  });

  it("should not add /mcp when already present", () => {
    expect(resolveRemoteUrl("https://rover.rizom.ai/mcp")).toBe(
      "https://rover.rizom.ai/mcp",
    );
  });

  it("should handle http:// for local dev", () => {
    expect(resolveRemoteUrl("http://localhost:8080")).toBe(
      "http://localhost:8080/mcp",
    );
  });

  it("should handle URL with trailing slash", () => {
    expect(resolveRemoteUrl("https://rover.rizom.ai/")).toBe(
      "https://rover.rizom.ai/mcp",
    );
  });
});

describe("resolveToken", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env["BRAIN_REMOTE_TOKEN"];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return flag token when provided", () => {
    expect(resolveToken("flag-token")).toBe("flag-token");
  });

  it("should fall back to BRAIN_REMOTE_TOKEN env var", () => {
    process.env["BRAIN_REMOTE_TOKEN"] = "env-token";
    expect(resolveToken(undefined)).toBe("env-token");
  });

  it("should prefer flag over env var", () => {
    process.env["BRAIN_REMOTE_TOKEN"] = "env-token";
    expect(resolveToken("flag-token")).toBe("flag-token");
  });

  it("should return undefined when neither is set", () => {
    expect(resolveToken(undefined)).toBeUndefined();
  });
});

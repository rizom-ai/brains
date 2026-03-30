import { describe, it, expect } from "bun:test";
import { parseArgs } from "../src/parse-args";

describe("operation commands parsing", () => {
  it("should parse 'list' with entity type", () => {
    const result = parseArgs(["list", "post"]);
    expect(result.command).toBe("list");
    expect(result.args[0]).toBe("post");
  });

  it("should parse 'get' with entity type and id", () => {
    const result = parseArgs(["get", "post", "my-first-post"]);
    expect(result.command).toBe("get");
    expect(result.args[0]).toBe("post");
    expect(result.args[1]).toBe("my-first-post");
  });

  it("should parse 'search' with query", () => {
    const result = parseArgs(["search", "how to deploy"]);
    expect(result.command).toBe("search");
    expect(result.args[0]).toBe("how to deploy");
  });

  it("should parse 'sync'", () => {
    const result = parseArgs(["sync"]);
    expect(result.command).toBe("sync");
  });

  it("should parse 'build'", () => {
    const result = parseArgs(["build"]);
    expect(result.command).toBe("build");
  });

  it("should parse 'build' with --preview flag", () => {
    const result = parseArgs(["build", "--preview"]);
    expect(result.command).toBe("build");
    expect(result.flags.preview).toBe(true);
  });

  it("should parse 'status'", () => {
    const result = parseArgs(["status"]);
    expect(result.command).toBe("status");
  });
});

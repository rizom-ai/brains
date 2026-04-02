import { describe, it, expect } from "bun:test";
import { formatBootError } from "../src/lib/boot-errors";

describe("formatBootError", () => {
  it("should classify database errors", () => {
    const msg = formatBootError(new Error("SQLITE_CANTOPEN: unable to open"));
    expect(msg).toContain("Database error");
    expect(msg).toContain("data directory");
  });

  it("should classify port-in-use errors", () => {
    const msg = formatBootError(new Error("listen EADDRINUSE :3333"));
    expect(msg).toContain("Port already in use");
  });

  it("should classify permission errors", () => {
    const msg = formatBootError(new Error("EACCES: permission denied"));
    expect(msg).toContain("Permission denied");
  });

  it("should classify plugin config errors", () => {
    const msg = formatBootError(new Error("Plugin 'blog' config: Zod error"));
    expect(msg).toContain("Plugin configuration error");
  });

  it("should classify git sync errors", () => {
    const msg = formatBootError(new Error("GIT_SYNC_TOKEN not set"));
    expect(msg).toContain("Git sync error");
  });

  it("should handle generic errors", () => {
    const msg = formatBootError(new Error("something unexpected"));
    expect(msg).toContain("Boot failed");
    expect(msg).toContain("something unexpected");
  });

  it("should handle non-Error values", () => {
    const msg = formatBootError("string error");
    expect(msg).toContain("Boot failed");
  });
});

import { describe, it, expect } from "bun:test";
import { parseArgs } from "../src/parse-args";

describe("command routing", () => {
  describe("no-boot commands stay direct", () => {
    it("should route 'init' as no-boot", () => {
      const result = parseArgs(["init", "mybrain"]);
      expect(result.command).toBe("init");
    });

    it("should route 'start' as no-boot", () => {
      const result = parseArgs(["start"]);
      expect(result.command).toBe("start");
    });

    it("should route 'chat' as no-boot", () => {
      const result = parseArgs(["chat"]);
      expect(result.command).toBe("chat");
    });
  });

  describe("tool command for raw invocation", () => {
    it("should parse 'tool' with tool name and input", () => {
      const result = parseArgs([
        "tool",
        "system_list",
        '{"entityType":"post"}',
      ]);
      expect(result.command).toBe("tool");
      expect(result.args[0]).toBe("system_list");
      expect(result.args[1]).toBe('{"entityType":"post"}');
    });

    it("should parse 'tool' with just tool name", () => {
      const result = parseArgs(["tool", "system_status"]);
      expect(result.command).toBe("tool");
      expect(result.args[0]).toBe("system_status");
    });
  });

  describe("everything else goes through tool registry", () => {
    it("should route 'list' as registry command with args", () => {
      const result = parseArgs(["list", "post"]);
      expect(result.command).toBe("list");
      expect(result.args[0]).toBe("post");
    });

    it("should route 'sync' as registry command", () => {
      const result = parseArgs(["sync"]);
      expect(result.command).toBe("sync");
    });

    it("should route 'build' with --preview flag", () => {
      const result = parseArgs(["build", "--preview"]);
      expect(result.command).toBe("build");
      expect(result.flags.preview).toBe(true);
    });

    it("should route unknown commands to registry", () => {
      const result = parseArgs(["foobar"]);
      expect(result.command).toBe("foobar");
    });
  });
});

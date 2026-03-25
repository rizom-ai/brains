import { describe, it, expect } from "bun:test";
import { HackMDPlugin, hackmdPlugin, hackmdConfigSchema } from "../src/index";

// ============================================================================
// Access protected methods via a test subclass
// ============================================================================

class TestableHackMDPlugin extends HackMDPlugin {
  public exposedGetServerCommand(): ReturnType<
    HackMDPlugin["getServerCommand"]
  > {
    return this.getServerCommand();
  }

  public exposedGetAllowedTools(): ReturnType<HackMDPlugin["getAllowedTools"]> {
    return this.getAllowedTools();
  }

  public exposedGetAgentInstructions(): ReturnType<
    HackMDPlugin["getAgentInstructions"]
  > {
    return this.getAgentInstructions();
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("HackMDPlugin", () => {
  // --------------------------------------------------------------------------
  // Config validation
  // --------------------------------------------------------------------------

  describe("config", () => {
    it("requires a token", () => {
      const result = hackmdConfigSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("accepts a valid token", () => {
      const result = hackmdConfigSchema.safeParse({ token: "hackmd_test123" });
      expect(result.success).toBe(true);
    });

    it("throws when constructing without a token", () => {
      expect(() => new HackMDPlugin({})).toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Plugin metadata
  // --------------------------------------------------------------------------

  describe("metadata", () => {
    it("has id 'hackmd'", () => {
      const plugin = new TestableHackMDPlugin({ token: "test" });
      expect(plugin.id).toBe("hackmd");
    });

    it("is a core plugin", () => {
      const plugin = new TestableHackMDPlugin({ token: "test" });
      expect(plugin.type).toBe("core");
    });
  });

  // --------------------------------------------------------------------------
  // Server command
  // --------------------------------------------------------------------------

  describe("server command", () => {
    it("spawns hackmd-mcp via npx", () => {
      const plugin = new TestableHackMDPlugin({ token: "test" });
      const cmd = plugin.exposedGetServerCommand();

      expect(cmd.command).toBe("npx");
      expect(cmd.args).toEqual(["-y", "hackmd-mcp"]);
    });

    it("passes the token via HACKMD_API_TOKEN env", () => {
      const plugin = new TestableHackMDPlugin({ token: "my_secret_token" });
      const cmd = plugin.exposedGetServerCommand();
      const env = cmd.env ?? {};

      expect(env["HACKMD_API_TOKEN"]).toBe("my_secret_token");
    });
  });

  // --------------------------------------------------------------------------
  // Read-only tool allowlist
  // --------------------------------------------------------------------------

  describe("allowed tools", () => {
    it("includes only read tools", () => {
      const plugin = new TestableHackMDPlugin({ token: "test" });
      const tools = plugin.exposedGetAllowedTools();

      expect(tools).toContain("get_user_info");
      expect(tools).toContain("list_user_notes");
      expect(tools).toContain("get_note");
      expect(tools).toContain("get_history");
      expect(tools).toContain("list_teams");
      expect(tools).toContain("list_team_notes");
    });

    it("does not include write tools", () => {
      const plugin = new TestableHackMDPlugin({ token: "test" });
      const tools = plugin.exposedGetAllowedTools();

      expect(tools).not.toContain("create_note");
      expect(tools).not.toContain("update_note");
      expect(tools).not.toContain("delete_note");
      expect(tools).not.toContain("create_team_note");
      expect(tools).not.toContain("update_team_note");
      expect(tools).not.toContain("delete_team_note");
    });
  });

  // --------------------------------------------------------------------------
  // Agent instructions
  // --------------------------------------------------------------------------

  describe("instructions", () => {
    it("mentions hackmd_ tool prefix", () => {
      const plugin = new TestableHackMDPlugin({ token: "test" });
      const instructions = plugin.exposedGetAgentInstructions();

      expect(instructions).toContain("hackmd_");
    });

    it("mentions read-only constraint", () => {
      const plugin = new TestableHackMDPlugin({ token: "test" });
      const instructions = plugin.exposedGetAgentInstructions();

      expect(instructions).toContain("read");
    });
  });

  // --------------------------------------------------------------------------
  // Factory function
  // --------------------------------------------------------------------------

  describe("factory", () => {
    it("creates a HackMDPlugin via hackmdPlugin()", () => {
      const plugin = hackmdPlugin({ token: "test" });
      expect(plugin).toBeInstanceOf(HackMDPlugin);
    });
  });
});

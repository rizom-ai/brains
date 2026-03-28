import { describe, it, expect } from "bun:test";
import { NotionPlugin, notionPlugin, notionConfigSchema } from "../src/index";

// ============================================================================
// Access protected methods via a test subclass
// ============================================================================

class TestableNotionPlugin extends NotionPlugin {
  public exposedGetServerCommand(): ReturnType<
    NotionPlugin["getServerCommand"]
  > {
    return this.getServerCommand();
  }

  public exposedGetAllowedTools(): ReturnType<NotionPlugin["getAllowedTools"]> {
    return this.getAllowedTools();
  }

  public exposedGetAgentInstructions(): ReturnType<
    NotionPlugin["getAgentInstructions"]
  > {
    return this.getAgentInstructions();
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("NotionPlugin", () => {
  // --------------------------------------------------------------------------
  // Config validation
  // --------------------------------------------------------------------------

  describe("config", () => {
    it("requires a token", () => {
      const result = notionConfigSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("accepts a valid token", () => {
      const result = notionConfigSchema.safeParse({ token: "ntn_test123" });
      expect(result.success).toBe(true);
    });

    it("throws when constructing without a token", () => {
      expect(() => new NotionPlugin({})).toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Plugin metadata
  // --------------------------------------------------------------------------

  describe("metadata", () => {
    it("has id 'notion'", () => {
      const plugin = new TestableNotionPlugin({ token: "ntn_test" });
      expect(plugin.id).toBe("notion");
    });

    it("is a core plugin", () => {
      const plugin = new TestableNotionPlugin({ token: "ntn_test" });
      expect(plugin.type).toBe("service");
    });
  });

  // --------------------------------------------------------------------------
  // Server command
  // --------------------------------------------------------------------------

  describe("server command", () => {
    it("spawns the official Notion MCP server via npx", () => {
      const plugin = new TestableNotionPlugin({ token: "ntn_test" });
      const cmd = plugin.exposedGetServerCommand();

      expect(cmd.command).toBe("npx");
      expect(cmd.args).toEqual(["-y", "@notionhq/notion-mcp-server"]);
    });

    it("passes the token via OPENAPI_MCP_HEADERS env", () => {
      const plugin = new TestableNotionPlugin({ token: "ntn_my_secret" });
      const cmd = plugin.exposedGetServerCommand();
      const env = cmd.env ?? {};
      const rawHeaders = env["OPENAPI_MCP_HEADERS"] ?? "{}";
      const headers = JSON.parse(rawHeaders) as Record<string, string>;

      expect(headers["Authorization"]).toBe("Bearer ntn_my_secret");
      expect(headers["Notion-Version"]).toBe("2022-06-28");
    });
  });

  // --------------------------------------------------------------------------
  // Read-only tool allowlist
  // --------------------------------------------------------------------------

  describe("allowed tools", () => {
    it("includes only read tools", () => {
      const plugin = new TestableNotionPlugin({ token: "ntn_test" });
      const tools = plugin.exposedGetAllowedTools();

      expect(tools).toEqual([
        "search",
        "read_page",
        "retrieve_block_children",
        "list_databases",
        "query_database",
      ]);
    });

    it("does not include write tools", () => {
      const plugin = new TestableNotionPlugin({ token: "ntn_test" });
      const tools = plugin.exposedGetAllowedTools();

      expect(tools).not.toContain("create_page");
      expect(tools).not.toContain("update_page");
      expect(tools).not.toContain("delete_block");
      expect(tools).not.toContain("append_block_children");
    });
  });

  // --------------------------------------------------------------------------
  // Agent instructions
  // --------------------------------------------------------------------------

  describe("instructions", () => {
    it("mentions notion_ tool prefix", () => {
      const plugin = new TestableNotionPlugin({ token: "ntn_test" });
      const instructions = plugin.exposedGetAgentInstructions();

      expect(instructions).toContain("notion_");
    });

    it("mentions read-only constraint", () => {
      const plugin = new TestableNotionPlugin({ token: "ntn_test" });
      const instructions = plugin.exposedGetAgentInstructions();

      expect(instructions).toContain("read");
    });

    it("lists all exposed tools", () => {
      const plugin = new TestableNotionPlugin({ token: "ntn_test" });
      const instructions = plugin.exposedGetAgentInstructions();

      expect(instructions).toContain("notion_search");
      expect(instructions).toContain("notion_read_page");
      expect(instructions).toContain("notion_retrieve_block_children");
      expect(instructions).toContain("notion_list_databases");
      expect(instructions).toContain("notion_query_database");
    });
  });

  // --------------------------------------------------------------------------
  // Factory function
  // --------------------------------------------------------------------------

  describe("factory", () => {
    it("creates a NotionPlugin via notionPlugin()", () => {
      const plugin = notionPlugin({ token: "ntn_factory" });
      expect(plugin).toBeInstanceOf(NotionPlugin);
    });
  });
});

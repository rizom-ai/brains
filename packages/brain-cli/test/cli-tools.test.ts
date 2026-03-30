import { describe, it, expect } from "bun:test";

/**
 * Tests for the cli metadata on Tool type.
 * These test the type and the matching logic, not actual tool invocation.
 */

interface CLIMetadata {
  name: string;
  mapInput: (
    args: string[],
    flags: Record<string, unknown>,
  ) => Record<string, unknown>;
}

interface MockTool {
  name: string;
  cli?: CLIMetadata | undefined;
}

function findCliTool(tools: MockTool[], cliName: string): MockTool | undefined {
  return tools.find((t) => t.cli?.name === cliName);
}

function getCliTools(tools: MockTool[]): MockTool[] {
  return tools.filter((t) => t.cli !== undefined);
}

describe("CLI metadata on tools", () => {
  const tools: MockTool[] = [
    {
      name: "system_list",
      cli: {
        name: "list",
        mapInput: (args) => ({ entityType: args[0] }),
      },
    },
    {
      name: "system_get",
      cli: {
        name: "get",
        mapInput: (args) => ({ entityType: args[0], id: args[1] }),
      },
    },
    {
      name: "system_search",
      cli: {
        name: "search",
        mapInput: (args) => ({ query: args[0] }),
      },
    },
    {
      name: "system_status",
      cli: {
        name: "status",
        mapInput: () => ({}),
      },
    },
    {
      name: "directory-sync_sync",
      cli: {
        name: "sync",
        mapInput: () => ({}),
      },
    },
    {
      name: "site-builder_build-site",
      cli: {
        name: "build",
        mapInput: (_args, flags) => ({
          environment: flags["preview"] ? "preview" : "production",
        }),
      },
    },
    {
      name: "system_create",
      // No cli — not a CLI command
    },
    {
      name: "image_generate",
      // No cli — not a CLI command
    },
  ];

  it("should find tool by cli name", () => {
    const tool = findCliTool(tools, "list");
    expect(tool?.name).toBe("system_list");
  });

  it("should return undefined for unknown cli name", () => {
    const tool = findCliTool(tools, "deploy");
    expect(tool).toBeUndefined();
  });

  it("should filter to only CLI-enabled tools", () => {
    const cliTools = getCliTools(tools);
    expect(cliTools).toHaveLength(6);
    expect(cliTools.every((t) => t.cli !== undefined)).toBe(true);
  });

  it("should exclude tools without cli metadata", () => {
    const cliTools = getCliTools(tools);
    const names = cliTools.map((t) => t.name);
    expect(names).not.toContain("system_create");
    expect(names).not.toContain("image_generate");
  });

  it("should map list args to tool input", () => {
    const tool = findCliTool(tools, "list");
    const input = tool?.cli?.mapInput(["post"], {});
    expect(input).toEqual({ entityType: "post" });
  });

  it("should map get args to tool input", () => {
    const tool = findCliTool(tools, "get");
    const input = tool?.cli?.mapInput(["post", "my-first-post"], {});
    expect(input).toEqual({ entityType: "post", id: "my-first-post" });
  });

  it("should map search args to tool input", () => {
    const tool = findCliTool(tools, "search");
    const input = tool?.cli?.mapInput(["how to deploy"], {});
    expect(input).toEqual({ query: "how to deploy" });
  });

  it("should map build flags to tool input", () => {
    const tool = findCliTool(tools, "build");
    expect(tool?.cli?.mapInput([], {})).toEqual({
      environment: "production",
    });
    expect(tool?.cli?.mapInput([], { preview: true })).toEqual({
      environment: "preview",
    });
  });

  it("should map sync with no args", () => {
    const tool = findCliTool(tools, "sync");
    const input = tool?.cli?.mapInput([], {});
    expect(input).toEqual({});
  });

  it("should map status with no args", () => {
    const tool = findCliTool(tools, "status");
    const input = tool?.cli?.mapInput([], {});
    expect(input).toEqual({});
  });
});

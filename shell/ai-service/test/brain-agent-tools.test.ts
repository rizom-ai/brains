import { describe, expect, it, mock } from "bun:test";
import type { Tool } from "@brains/mcp-service";
import { z } from "@brains/utils";
import { filterToolsForCallOptions } from "../src/brain-agent";

function tool(name: string): Tool {
  return {
    name,
    description: name,
    inputSchema: { value: z.string().optional() },
    visibility: "public",
    handler: mock(async () => ({ success: true as const })),
  };
}

describe("filterToolsForCallOptions", () => {
  it("keeps system_create available when raw upload save is available", () => {
    const tools = [
      tool("system_create"),
      tool("system_upload_save"),
      tool("system_search"),
    ];

    expect(
      filterToolsForCallOptions(tools, {
        enableUploadSave: true,
        hasPriorResponseCandidate: false,
      }).map((t) => t.name),
    ).toEqual(["system_create", "system_upload_save", "system_search"]);
  });

  it("prefers prior-response create over stale upload save", () => {
    const tools = [
      tool("system_create"),
      tool("system_upload_save"),
      tool("system_search"),
    ];

    expect(
      filterToolsForCallOptions(tools, {
        enableUploadSave: true,
        hasPriorResponseCandidate: true,
      }).map((t) => t.name),
    ).toEqual(["system_create", "system_search"]);
  });

  it("hides upload save when no accessible upload save candidate exists", () => {
    const tools = [
      tool("system_create"),
      tool("system_upload_save"),
      tool("system_search"),
    ];

    expect(
      filterToolsForCallOptions(tools, {
        enableUploadSave: false,
        hasPriorResponseCandidate: false,
      }).map((t) => t.name),
    ).toEqual(["system_create", "system_search"]);
  });
});

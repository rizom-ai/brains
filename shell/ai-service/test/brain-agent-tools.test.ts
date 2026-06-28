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
  it("keeps system_create available for upload-preserve create flows", () => {
    const tools = [tool("system_create"), tool("system_search")];

    expect(
      filterToolsForCallOptions(tools, {
        hasPriorResponseCandidate: false,
      }).map((t) => t.name),
    ).toEqual(["system_create", "system_search"]);
  });

  it("keeps system_create available when prior-response candidates exist", () => {
    const tools = [tool("system_create"), tool("system_search")];

    expect(
      filterToolsForCallOptions(tools, {
        hasPriorResponseCandidate: true,
      }).map((t) => t.name),
    ).toEqual(["system_create", "system_search"]);
  });
});

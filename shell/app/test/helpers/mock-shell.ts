import { mock } from "bun:test";
import type { Shell } from "@brains/core";
import type { ToolResponse } from "@brains/mcp-service";

export interface MockShellTool {
  name: string;
  handler: (input: unknown, context: unknown) => Promise<ToolResponse>;
  /** Present on tools that are also exposed as `brain <cli.name>` commands. */
  cli?: { name: string };
  inputSchema?: Record<string, unknown>;
}

/**
 * A stand-in Shell for tests about App's orchestration and the CLI.
 *
 * Shell is a class with a large surface, and App exposes getShell(): Shell as
 * public API, so narrowing the injection parameter would change that return
 * type for every consumer. Constructing a real Shell needs a full config and a
 * database, which these tests — about initialize/shutdown ordering and tool
 * dispatch — have no use for. The widening is unavoidable; it lives in this
 * one factory so it is named once rather than at each call site.
 */
export const createMockShell = (
  tools: readonly MockShellTool[] = [],
): Shell => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- deliberate; the comment above explains why
  return {
    initialize: mock(() => Promise.resolve()),
    shutdown: mock(() => Promise.resolve()),
    getPluginManager: mock(() => ({
      registerPlugin: mock(() => {}),
    })),
    getMCPService: mock(() => ({
      listTools: (): { tool: MockShellTool }[] =>
        tools.map((tool) => ({ tool })),
      getCliTools: (): { tool: MockShellTool }[] =>
        tools.filter((tool) => tool.cli).map((tool) => ({ tool })),
    })),
  } as unknown as Shell;
};

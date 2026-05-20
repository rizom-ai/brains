import { mock } from "bun:test";
import type { IMCPService } from "@brains/mcp-service";

/**
 * Create a mock IMCPService for tests that need to satisfy the interface
 * without exercising the real MCP server. The register/list methods are
 * bun mocks that return empty/no-op values; `getMcpServer` and
 * `createMcpServer` throw because the real MCP server is from the
 * `@modelcontextprotocol/sdk` framework and cannot be stubbed without
 * unsafe casts. Override these in your test if you need them.
 */
export function createMockMCPService(): IMCPService {
  const mcpServerNotMocked = (): never => {
    throw new Error(
      "Mock MCP service has no real McpServer — override getMcpServer/createMcpServer in the test that needs it.",
    );
  };
  return {
    registerTool: mock(() => {}),
    registerResource: mock(() => {}),
    registerResourceTemplate: mock(() => {}),
    registerPrompt: mock(() => {}),
    registerInstructions: mock(() => {}),
    listTools: mock(() => []),
    getCliTools: mock(() => []),
    listToolsForPermissionLevel: mock(() => []),
    listResources: mock(() => []),
    getInstructions: mock(() => []),
    getMcpServer: mock(mcpServerNotMocked),
    createMcpServer: mock(mcpServerNotMocked),
    setPermissionLevel: mock(() => {}),
  };
}

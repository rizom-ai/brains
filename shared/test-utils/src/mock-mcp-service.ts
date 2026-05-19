import { mock } from "bun:test";
import type { IMCPService } from "@brains/mcp-service";

/**
 * Create a mock IMCPService for tests that need to satisfy the interface
 * without exercising the real MCP server. All methods are bun mocks that
 * return empty/no-op values; override individual methods in your test as
 * needed.
 */
export function createMockMCPService(): IMCPService {
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
    getMcpServer: mock(() => ({}) as ReturnType<IMCPService["getMcpServer"]>),
    createMcpServer: mock(
      () => ({}) as ReturnType<IMCPService["createMcpServer"]>,
    ),
    setPermissionLevel: mock(() => {}),
  };
}

// Main exports
export { StdioMCPServer } from "./server/stdio-mcp-server";
export { StreamableHTTPServer } from "./server/streamableHttpServer";

// Type exports
export type { MCPServerConfig } from "./types";
export type { StreamableHTTPServerConfig } from "./server/streamableHttpServer";
export type { StdioMCPServerConfig } from "./server/stdio-mcp-server";

// Re-export the McpServer type from SDK for registration
export type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

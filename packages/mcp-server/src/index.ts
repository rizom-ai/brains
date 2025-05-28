// Main exports
export { MCPServer } from "./server/mcpServer";
export { StreamableHTTPServer } from "./server/streamableHttpServer";

// Type exports
export type { MCPServerConfig } from "./types";
export type { StreamableHTTPServerConfig } from "./server/streamableHttpServer";

// Re-export the McpServer type from SDK for registration
export type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

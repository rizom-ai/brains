/**
 * MCP (Model Context Protocol) integration for shell package
 *
 * This module provides functions to register shell's tools and resources
 * with an MCP server. The shell package doesn't depend on the MCP server
 * package - instead, it receives an MCP server instance and registers its
 * capabilities with it.
 */

export { registerShellTools } from "./tools";
export { registerShellResources } from "./resources";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerShellTools } from "./tools";
import { registerShellResources } from "./resources";
import type { QueryProcessor } from "../query/queryProcessor";
import type { EntityService } from "../entity/entityService";
import type { ContentGenerationService } from "../content/contentGenerationService";
import type { ContentRegistry } from "../content/content-registry";
import type { Logger } from "@brains/utils";

export interface ShellMCPOptions {
  queryProcessor: QueryProcessor;
  entityService: EntityService;
  contentRegistry: ContentRegistry;
  contentGenerationService: ContentGenerationService;
  logger: Logger;
}

/**
 * Register all shell capabilities (tools and resources) with an MCP server
 */
export function registerShellMCP(
  server: McpServer,
  options: ShellMCPOptions,
): void {
  // Register tools
  registerShellTools(server, options);

  // Register resources
  registerShellResources(server, options);
}

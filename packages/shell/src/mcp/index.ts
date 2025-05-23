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
import type { BrainProtocol } from "../protocol/brainProtocol";
import type { EntityService } from "../entity/entityService";
import type { SchemaRegistry } from "../schema/schemaRegistry";
import type { Logger } from "../utils/logger";

export interface ShellMCPOptions {
  queryProcessor: QueryProcessor;
  brainProtocol: BrainProtocol;
  entityService: EntityService;
  schemaRegistry: SchemaRegistry;
  logger: Logger;
}

/**
 * Register all shell capabilities (tools and resources) with an MCP server
 */
export function registerShellMCP(
  server: McpServer,
  options: ShellMCPOptions
): void {
  // Register tools
  registerShellTools(server, options);

  // Register resources
  registerShellResources(server, options);
}
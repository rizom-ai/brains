/**
 * Personal Brain Shell Package
 *
 * This is the core package that provides the foundational architecture
 * for the Personal Brain application.
 */

// Export MCP registration functions (if external apps want to use MCP)
export { registerShellMCP } from "./mcp";
export type { ShellMCPOptions } from "./mcp";

// TODO: Add a proper Shell class that encapsulates all functionality
// For now, keeping minimal exports until we define the proper public API

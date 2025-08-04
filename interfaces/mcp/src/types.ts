// Re-export config types from config
export type { MCPConfig, MCPConfigInput } from "./config";

// Derive transport type from schema
import type { MCPConfig } from "./config";
export type TransportType = MCPConfig["transport"];

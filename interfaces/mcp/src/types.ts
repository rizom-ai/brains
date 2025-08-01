// Re-export config types from schemas
export type { MCPConfig, MCPConfigInput } from "./schemas";

// Derive transport type from schema
import type { MCPConfig } from "./schemas";
export type TransportType = MCPConfig["transport"];

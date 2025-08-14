import type { MCPConfig } from "./config";

// Re-export config types from config
export type { MCPConfig };

// Derive transport type from schema
export type TransportType = MCPConfig["transport"];

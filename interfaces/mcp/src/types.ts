import type { z } from "zod";
import type { mcpConfigSchema } from "./schemas";

export type MCPConfig = z.infer<typeof mcpConfigSchema>;
export type MCPConfigInput = z.input<typeof mcpConfigSchema>;

// Derive transport type from schema
export type TransportType = MCPConfig["transport"];

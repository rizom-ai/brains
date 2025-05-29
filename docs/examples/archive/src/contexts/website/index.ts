/**
 * Website Context - Manages website generation and publication
 */

// Export MCP implementation
export { MCPWebsiteContext } from './MCPWebsiteContext';

// Export configuration types
export type { MCPWebsiteContextConfig, MCPWebsiteContextDependencies } from './MCPWebsiteContext';

// Type exports for configuration
export type { WebsiteStorageAdapter } from './adapters/websiteStorageAdapter';
export type { DeploymentAdapter } from './adapters/deploymentAdapter';
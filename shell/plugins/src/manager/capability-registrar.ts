import type { Logger } from "@brains/utils/logger";
import type { IShell } from "../interfaces";
import type { PluginCapabilities } from "../interfaces";
import type { IProjectionRegistry } from "../entity/projection-registry";

/**
 * Handles registration of plugin capabilities (tools, resources)
 * Extracted from PluginManager for single responsibility
 */
export class CapabilityRegistrar {
  private readonly logger: Logger;
  private readonly projectionRegistry: IProjectionRegistry;

  constructor(logger: Logger, projectionRegistry: IProjectionRegistry) {
    this.logger = logger.child("CapabilityRegistrar");
    this.projectionRegistry = projectionRegistry;
  }

  /**
   * Register plugin capabilities using Shell convenience methods
   */
  public async registerCapabilities(
    shell: IShell,
    pluginId: string,
    capabilities: PluginCapabilities,
    options?: { executionOnly?: boolean | undefined },
  ): Promise<void> {
    // The worker constructs handlers but exposes no agent-facing surface.
    if (!options?.executionOnly && capabilities.tools.length > 0) {
      shell.registerTools(pluginId, capabilities.tools);
      this.logger.debug(
        `Registered ${capabilities.tools.length} tools from ${pluginId}`,
      );
    }

    // Register resources
    if (!options?.executionOnly && capabilities.resources.length > 0) {
      shell.registerResources(pluginId, capabilities.resources);
      this.logger.debug(
        `Registered ${capabilities.resources.length} resources from ${pluginId}`,
      );
    }

    // Register instructions
    if (!options?.executionOnly && capabilities.instructions) {
      shell.registerInstructions(pluginId, capabilities.instructions);
      this.logger.debug(`Registered instructions from ${pluginId}`);
    }

    const projectionRules = capabilities.projectionRules ?? [];
    try {
      for (const rule of projectionRules) {
        this.projectionRegistry.registerRule(pluginId, rule);
      }
    } catch (error) {
      this.projectionRegistry.unregisterPlugin(pluginId);
      throw error;
    }
    if (projectionRules.length > 0) {
      this.logger.debug(
        `Registered ${projectionRules.length} projection rules from ${pluginId}`,
      );
    }
  }
}

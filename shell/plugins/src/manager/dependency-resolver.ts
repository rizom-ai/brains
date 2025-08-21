import type { Logger } from "@brains/utils";
import type { EventEmitter } from "events";
import type { PluginInfo } from "./types";
import { PluginStatus, PluginEvent } from "./types";
import { PluginError } from "../errors";

/**
 * Handles plugin dependency resolution and initialization order
 * Extracted from PluginManager for single responsibility
 */
export class DependencyResolver {
  private logger: Logger;

  constructor(
    private plugins: Map<string, PluginInfo>,
    private events: EventEmitter,
    logger: Logger,
  ) {
    this.logger = logger.child("DependencyResolver");
  }

  /**
   * Get plugin IDs in dependency order for initialization
   * Returns array of plugin IDs that can be initialized, considering dependencies
   */
  public async resolveInitializationOrder(
    initializeCallback: (pluginId: string) => Promise<void>,
  ): Promise<{
    initialized: Set<string>;
    failed: string[];
  }> {
    this.logger.info("Resolving plugin initialization order...");

    // Get all plugin IDs
    const allPluginIds = Array.from(this.plugins.keys());

    // Track attempted plugins (to prevent infinite loops)
    const attempted = new Set<string>();

    // Try to initialize all plugins
    let progress = true;

    // Continue until all plugins are attempted or no progress can be made
    while (progress && attempted.size < allPluginIds.length) {
      progress = false;

      // Iterate through all plugins
      for (const pluginId of allPluginIds) {
        // Skip already attempted plugins
        if (attempted.has(pluginId)) {
          continue;
        }

        const pluginInfo = this.plugins.get(pluginId);
        if (!pluginInfo) {
          continue;
        }

        // Check if all dependencies are initialized (check actual status, not attempted)
        const unmetDependencies = this.getUnmetDependencies(pluginId);

        if (unmetDependencies.length === 0) {
          // All dependencies are satisfied, initialize this plugin
          try {
            await initializeCallback(pluginId);
            attempted.add(pluginId);
            progress = true;
          } catch (error) {
            // Mark as error and continue with others
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            this.logger.error(
              `Failed to initialize plugin ${pluginId}: ${errorMessage}`,
            );

            // Plugin status and error event are already set in initializePlugin
            // Consider this "handled" for dependency resolution
            attempted.add(pluginId);
            progress = true;
          }
        }
      }
    }

    // Check for plugins that couldn't be initialized due to dependency issues
    const uninitializedPlugins = allPluginIds.filter(
      (id) => !attempted.has(id),
    );

    if (uninitializedPlugins.length > 0) {
      const pluginList = uninitializedPlugins.join(", ");
      this.logger.error(
        `Failed to initialize plugins due to dependency issues: ${pluginList}`,
      );

      // Report specific issues for each plugin
      for (const pluginId of uninitializedPlugins) {
        const unmetDependencies = this.getUnmetDependencies(pluginId);
        this.logger.error(
          `Plugin ${pluginId} has unmet dependencies: ${unmetDependencies.join(", ")}`,
        );

        // Update plugin status
        const pluginInfo = this.plugins.get(pluginId);
        if (pluginInfo) {
          pluginInfo.status = PluginStatus.ERROR;
          pluginInfo.error = new PluginError(
            pluginId,
            `Unmet dependencies: ${unmetDependencies.join(", ")}`,
          );
        }

        // Emit error event
        this.events.emit(PluginEvent.ERROR, pluginId, pluginInfo?.error);
      }
    }

    // Get successfully initialized plugins (those with INITIALIZED status)
    const initialized = new Set<string>();
    for (const [pluginId, pluginInfo] of this.plugins) {
      if (pluginInfo.status === PluginStatus.INITIALIZED) {
        initialized.add(pluginId);
      }
    }

    this.logger.info(
      `Resolved ${initialized.size} of ${allPluginIds.length} plugins`,
    );

    return {
      initialized,
      failed: uninitializedPlugins,
    };
  }

  /**
   * Check if all dependencies of a plugin are met
   */
  public getUnmetDependencies(pluginId: string): string[] {
    const pluginInfo = this.plugins.get(pluginId);
    if (!pluginInfo) {
      return [];
    }

    const { dependencies } = pluginInfo;
    const unmetDependencies: string[] = [];

    for (const depId of dependencies) {
      // Check if dependency exists
      const dependency = this.plugins.get(depId);

      if (!dependency) {
        unmetDependencies.push(depId);
        continue;
      }

      // Check if dependency is initialized (not just registered)
      if (dependency.status !== PluginStatus.INITIALIZED) {
        unmetDependencies.push(depId);
      }
    }

    return unmetDependencies;
  }
}

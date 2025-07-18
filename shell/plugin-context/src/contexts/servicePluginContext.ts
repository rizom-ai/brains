import type { EntityService } from "@brains/entity-service";
import type { BaseEntity, EntityAdapter } from "@brains/types";
import type { z } from "zod";
import type { ContentGenerationConfig } from "@brains/plugin-utils";
import type { ServicePlugin, ServicePluginContext } from "../types";
import {
  createCorePluginContext,
  type CoreServices,
} from "./corePluginContext";

// Extended services for service plugins
export interface ServiceServices extends CoreServices {
  entityService: EntityService;
  entityRegistry: {
    registerEntityType<T extends BaseEntity>(
      entityType: string,
      schema: z.ZodSchema<T>,
      adapter: EntityAdapter<T>,
    ): void;
  };
  // Shell reference for content generation delegation
  shell: {
    generateContent: <T = unknown>(config: ContentGenerationConfig) => Promise<T>;
  };
}

export function createServicePluginContext(
  plugin: ServicePlugin,
  services: ServiceServices,
): ServicePluginContext {
  // Get the core context
  const coreContext = createCorePluginContext(plugin, services);

  return {
    // Spread all core context properties
    ...coreContext,

    // Add content generation (AI-powered) - delegates to Shell
    generateContent: <T = unknown>(config: ContentGenerationConfig): Promise<T> => {
      return services.shell.generateContent<T>(config);
    },

    // Add entity-specific capabilities
    entityService: services.entityService,

    registerEntityType: <T extends BaseEntity>(
      entityType: string,
      schema: z.ZodSchema<T>,
      adapter: EntityAdapter<T>,
    ): void => {
      services.entityRegistry.registerEntityType(entityType, schema, adapter);
      coreContext.logger.debug(`Registered entity type: ${entityType}`);
    },
  };
}

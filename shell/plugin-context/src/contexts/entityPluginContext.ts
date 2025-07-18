import type { EntityService } from "@brains/entity-service";
import type { BaseEntity, EntityAdapter } from "@brains/types";
import type { z } from "zod";
import type { EntityPlugin, EntityPluginContext } from "../types";
import {
  createCorePluginContext,
  type CoreServices,
} from "./corePluginContext";

// Extended services for entity plugins
export interface EntityServices extends CoreServices {
  entityService: EntityService;
  entityRegistry: {
    registerEntityType<T extends BaseEntity>(
      entityType: string,
      schema: z.ZodSchema<T>,
      adapter: EntityAdapter<T>,
    ): void;
  };
}

export function createEntityPluginContext(
  plugin: EntityPlugin,
  services: EntityServices,
): EntityPluginContext {
  // Get the core context
  const coreContext = createCorePluginContext(plugin, services);

  return {
    // Spread all core context properties
    ...coreContext,

    // Add entity-specific capabilities
    entityService: services.entityService,

    registerEntityType: <T extends BaseEntity>(
      entityType: string,
      schema: z.ZodSchema<T>,
      adapter: EntityAdapter<T>,
    ) => {
      services.entityRegistry.registerEntityType(entityType, schema, adapter);
      coreContext.logger.debug(`Registered entity type: ${entityType}`);
    },
  };
}

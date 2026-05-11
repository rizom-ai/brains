import { knowledgeQueryTemplate } from "@brains/content-service";
import {
  BaseEntityFormatter,
  FallbackEntityAdapter,
  baseEntitySchema,
  type IEntityRegistry,
} from "@brains/entity-service";
import {
  AnchorProfileAdapter,
  BrainCharacterAdapter,
  CanonicalIdentityLinkAdapter,
} from "@brains/identity-service";
import type {
  Plugin,
  PluginManager,
  PluginRegistrationContext,
} from "@brains/plugins";
import type { TemplateRegistry } from "@brains/templates";
import type { Logger } from "@brains/utils";

import { SHELL_ENTITY_TYPES, SHELL_TEMPLATE_NAMES } from "../constants";
export interface PluginInitializeOptions {
  registerOnly?: boolean;
  registrationContext?: PluginRegistrationContext;
}

export function registerShellTemplates(
  templateRegistry: TemplateRegistry,
  logger: Logger,
): void {
  templateRegistry.register(
    knowledgeQueryTemplate.name,
    knowledgeQueryTemplate,
  );
  logger.debug("Shell system templates registered");
}

export function registerBaseEntityDisplayTemplate(
  templateRegistry: TemplateRegistry,
  logger: Logger,
): void {
  templateRegistry.register(SHELL_TEMPLATE_NAMES.BASE_ENTITY_DISPLAY, {
    name: "base-entity-display",
    description: "Display template for base entities",
    schema: baseEntitySchema,
    formatter: new BaseEntityFormatter(),
    requiredPermission: "public",
  });
  logger.debug("Base entity display template registered");
}

/**
 * Register a fallback base entity adapter.
 * Only called if no plugin (e.g. note plugin) has already registered "base".
 */
export function registerFallbackBaseEntity(
  entityRegistry: IEntityRegistry,
  logger: Logger,
): void {
  entityRegistry.registerEntityType(
    SHELL_ENTITY_TYPES.BASE,
    baseEntitySchema,
    new FallbackEntityAdapter(),
  );

  logger.debug("Fallback base entity adapter registered");
}

export function registerBrainCharacterSupport(
  entityRegistry: IEntityRegistry,
  logger: Logger,
): void {
  const characterAdapter = new BrainCharacterAdapter();
  entityRegistry.registerEntityType(
    SHELL_ENTITY_TYPES.BRAIN_CHARACTER,
    characterAdapter.schema,
    characterAdapter,
  );
  logger.debug("Brain character entity support registered");
}

export function registerAnchorProfileSupport(
  entityRegistry: IEntityRegistry,
  logger: Logger,
): void {
  const profileAdapter = new AnchorProfileAdapter();
  entityRegistry.registerEntityType(
    SHELL_ENTITY_TYPES.ANCHOR_PROFILE,
    profileAdapter.schema,
    profileAdapter,
  );
  logger.debug("Anchor profile entity support registered");
}

export function registerCanonicalIdentityLinkSupport(
  entityRegistry: IEntityRegistry,
  logger: Logger,
): void {
  const linkAdapter = new CanonicalIdentityLinkAdapter();
  entityRegistry.registerEntityType(
    SHELL_ENTITY_TYPES.CANONICAL_IDENTITY_LINK,
    linkAdapter.schema,
    linkAdapter,
  );
  logger.debug("Canonical identity link entity support registered");
}

export async function initializeConfiguredPlugins(options: {
  plugins: Plugin[];
  pluginManager: PluginManager;
  logger: Logger;
  initOptions: PluginInitializeOptions | undefined;
}): Promise<void> {
  const { plugins, pluginManager, logger, initOptions } = options;

  logger.debug(`Found ${plugins.length} plugins to register`);

  for (const plugin of plugins) {
    logger.debug(`Registering plugin: ${plugin.id}`);
    pluginManager.registerPlugin(plugin);
  }

  await pluginManager.initializePlugins(initOptions?.registrationContext);

  if (!initOptions?.registerOnly) {
    for (const { id, error } of pluginManager.getFailedPlugins()) {
      const plugin = pluginManager.getPlugin(id);
      if (plugin?.requiresDaemonStartup?.()) {
        throw error;
      }
    }
  }

  logger.debug("Plugin initialization complete");
}

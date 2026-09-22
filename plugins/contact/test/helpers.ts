import {
  instantiatePluginPackageDefinition,
  ServicePlugin,
  type Plugin,
  type ServiceEntityService,
} from "@brains/plugins";
import type { JobEntityAccess } from "@brains/sdk/entities";
import {
  contactService,
  type ContactPluginConfig,
  type ContactDependencies,
} from "../src";

export function instantiate(
  config: ContactPluginConfig = {},
  dependencies: ContactDependencies = {},
): {
  service: ServicePlugin<unknown, unknown>;
  entity: Plugin;
} {
  const plugins = instantiatePluginPackageDefinition(
    contactService(dependencies),
    config,
    {
      name: "@brains/contact",
      version: "0.0.0-test",
    },
  );
  const service = plugins.find((plugin) => plugin instanceof ServicePlugin);
  const entity = plugins.find((plugin) => plugin.type === "entity");
  if (!service || !entity) throw new Error("Contact declarations missing");
  return { service, entity };
}

/** Domain fixtures adapt native storage; runtime ownership is tested through installation. */
export function contactEntities(
  entities: ServiceEntityService,
): Pick<
  JobEntityAccess,
  "getEntity" | "listEntities" | "create" | "update" | "delete"
> {
  return {
    getEntity: entities.getEntity.bind(entities),
    listEntities: entities.listEntities.bind(entities),
    create: (entity, options) => entities.createEntity({ entity, options }),
    update: (entity, options) => entities.updateEntity({ entity, options }),
    delete: (entityType, id) => entities.deleteEntity({ entityType, id }),
  };
}

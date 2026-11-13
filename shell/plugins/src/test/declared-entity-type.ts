import type { BaseEntity, EntityAdapter } from "@brains/entity-service";
import type { EntityActionPolicyConfig } from "@brains/templates";
import { isDeclarativeEntityPlugin } from "../entity/declarative-entity-plugin";
import type { Plugin } from "../interfaces";

/**
 * An entity type a declared package installs: the plugin, and what
 * registering its type takes, for a test that opens a store of its own.
 */
export type DeclaredEntityTypePlugin = Plugin & {
  readonly type: "entity";
  readonly entityType: string;
  readonly schema: EntityAdapter<BaseEntity>["schema"];
  readonly adapter: EntityAdapter<BaseEntity>;
  readonly entityActionPolicy?: EntityActionPolicyConfig;
};

/** Whether a value is an entity type a declared package installed. */
export function isDeclaredEntityType(
  value: unknown,
): value is DeclaredEntityTypePlugin {
  return isDeclarativeEntityPlugin(value);
}

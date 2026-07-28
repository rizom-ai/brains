import type { Plugin } from "@brains/plugins";
import {
  entityActionPolicyConfigSchema,
  type EntityActionPolicyConfig,
  type EntityActionRequiredLevel,
} from "@brains/templates";
import type { BrainDefinition } from "../brain-definition";
import type { InstanceOverrides } from "../instance-overrides";

const PLATFORM_ENTITY_ACTION_DEFAULTS: EntityActionPolicyConfig = {
  "*": {
    create: "admin",
    update: "admin",
    delete: "admin",
    extract: "admin",
    publish: "admin",
  },
  "anchor-profile": {
    create: "never",
    update: "admin",
    delete: "never",
  },
  "brain-character": {
    create: "never",
    update: "admin",
    delete: "never",
  },
};

/**
 * Build the permissions config by merging definition defaults with yaml overrides.
 *
 * Priority: yaml `permissions` section > yaml top-level `admins`/`anchors`/`trusted` > definition defaults
 */
export function buildPermissions(
  definitionPerms: BrainDefinition["permissions"],
  overrides?: Omit<InstanceOverrides, "brain">,
  plugins: Plugin[] = [],
): { permissions: Record<string, unknown> } | Record<string, never> {
  const yamlPerms = overrides?.permissions;
  const pluginEntityActions = mergePluginEntityActions(plugins);

  const entityActions = mergeEntityActions(
    PLATFORM_ENTITY_ACTION_DEFAULTS,
    pluginEntityActions,
    definitionPerms?.entityActions,
    yamlPerms?.entityActions,
  );
  validatePublishPolicy(entityActions);

  return {
    permissions: {
      ...(definitionPerms ?? {}),
      // Top-level values remain a compatibility input path.
      ...(overrides?.admins && { admins: overrides.admins }),
      ...(overrides?.anchors && { anchors: overrides.anchors }),
      ...(overrides?.trusted && { trusted: overrides.trusted }),
      // The nested permissions section takes priority.
      ...(yamlPerms?.admins && { admins: yamlPerms.admins }),
      ...(yamlPerms?.anchors && { anchors: yamlPerms.anchors }),
      ...(yamlPerms?.trusted && { trusted: yamlPerms.trusted }),
      ...(yamlPerms?.rules && { rules: yamlPerms.rules }),
      ...(entityActions && { entityActions }),
    },
  };
}

function mergePluginEntityActions(
  plugins: Plugin[],
): EntityActionPolicyConfig | undefined {
  const validated: EntityActionPolicyConfig[] = [];
  for (const plugin of plugins) {
    if (!plugin.entityActionPolicy) continue;
    const parsed = entityActionPolicyConfigSchema.safeParse(
      plugin.entityActionPolicy,
    );
    if (!parsed.success) {
      throw new Error(
        `Plugin "${plugin.id}" declared an invalid entityActionPolicy: ${parsed.error.message}`,
      );
    }
    validated.push(parsed.data);
  }
  return mergeEntityActions(...validated);
}

function mergeEntityActions(
  ...sources: Array<EntityActionPolicyConfig | undefined>
): EntityActionPolicyConfig | undefined {
  if (!sources.some(Boolean)) return undefined;

  const merged: EntityActionPolicyConfig = {};
  for (const source of sources) {
    if (!source) continue;
    for (const [entityType, actions] of Object.entries(source)) {
      merged[entityType] = {
        ...(merged[entityType] ?? {}),
        ...actions,
      };
    }
  }

  return merged;
}

const ENTITY_ACTION_RESTRICTIVENESS: Record<EntityActionRequiredLevel, number> =
  {
    public: 0,
    trusted: 1,
    admin: 2,
    never: 3,
  };

/**
 * Publishing must never be easier than editing: a brain that lets trusted
 * collaborators publish what only admins may edit has no gate at all.
 */
function validatePublishPolicy(
  policy: EntityActionPolicyConfig | undefined,
): void {
  if (!policy) return;

  for (const entityType of Object.keys(policy)) {
    const resolved = {
      ...(policy["*"] ?? {}),
      ...(policy[entityType] ?? {}),
    };
    if (!resolved.update || !resolved.publish) continue;

    if (
      ENTITY_ACTION_RESTRICTIVENESS[resolved.publish] <
      ENTITY_ACTION_RESTRICTIVENESS[resolved.update]
    ) {
      throw new Error(
        `Invalid entity action policy for "${entityType}": publish must be at least as restrictive as update`,
      );
    }
  }
}

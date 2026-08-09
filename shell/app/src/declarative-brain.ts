import {
  getPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  PluginConfigValidationError,
  type PluginPackageDefinition,
} from "@brains/plugins";
import type {
  BrainDefinition as DeclarativeBrainDefinition,
  CapabilityBundleDefinition as DeclarativeBundleDefinition,
} from "./contracts/brain-definition";
import type {
  BrainDefinition,
  CapabilityEntry,
  PluginConfig,
} from "./brain-definition";
import type { CapabilityBundleDefinition } from "./bundle-definition";
import { getBrainPackageMetadata } from "./package-registry";

export { isDeclarativeBrainDefinition } from "./declarative-brain-guard";

function toConfigRecord(value: object): PluginConfig {
  return Object.fromEntries(Object.entries(value));
}

function configError(
  definition: PluginPackageDefinition,
  error: PluginConfigValidationError,
): Error {
  const issues = error.issues
    .map(({ path, message }) => `${path || "<root>"}: ${message}`)
    .join("; ");
  return new Error(
    `Invalid config for plugin package definition "${definition.id}" (${error.pluginId}): ${issues}`,
    { cause: error },
  );
}

function capabilityEntry(
  configured: DeclarativeBrainDefinition["plugins"][number],
): CapabilityEntry {
  const definition = configured.definition;
  const metadata = getPluginPackageMetadata(definition);
  if (!metadata) {
    throw new Error(
      `Plugin package metadata is missing for definition "${definition.id}"; declare its package as a direct dependency of the brain definition package`,
    );
  }

  return [
    definition.id,
    (rawConfig): ReturnType<CapabilityEntry[1]> => {
      try {
        return instantiatePluginPackageDefinition(
          definition,
          rawConfig,
          metadata,
        );
      } catch (error) {
        if (error instanceof PluginConfigValidationError) {
          throw configError(definition, error);
        }
        throw error;
      }
    },
    toConfigRecord(configured.config),
  ];
}

function normalizeBundle(
  bundle: DeclarativeBundleDefinition,
): CapabilityBundleDefinition {
  return {
    id: bundle.id,
    members: bundle.members.map(({ definition }) => definition.id),
    ...(bundle.config
      ? {
          config: bundle.config.map((contribution) => ({
            member: contribution.member.definition.id,
            value: toConfigRecord(contribution.value),
            ...(contribution.overrides
              ? { overrides: contribution.overrides }
              : {}),
          })),
        }
      : {}),
    ...(bundle.permissions
      ? {
          permissions: bundle.permissions.map((contribution) => ({
            member: contribution.member.definition.id,
            config: contribution.config,
            ...(contribution.overrides
              ? { overrides: contribution.overrides }
              : {}),
          })),
        }
      : {}),
    ...(bundle.agentInstructions
      ? { agentInstructions: [...bundle.agentInstructions] }
      : {}),
    ...(bundle.evalDisable
      ? {
          evalDisable: bundle.evalDisable.map(
            ({ definition }) => definition.id,
          ),
        }
      : {}),
  };
}

export function normalizeDeclarativeBrainDefinition(
  definition: DeclarativeBrainDefinition,
): BrainDefinition {
  const metadata = getBrainPackageMetadata(definition);
  if (!metadata) {
    throw new Error(
      `Brain definition "${definition.name}" is missing installed package metadata`,
    );
  }

  return {
    name: definition.name,
    version: metadata.version,
    capabilities: definition.plugins.map(capabilityEntry),
    interfaces: [],
    ...(definition.anchor ? { anchor: definition.anchor } : {}),
    ...(definition.kind ? { kind: definition.kind } : {}),
    ...(definition.model ? { model: definition.model } : {}),
    ...(definition.reasoningEffort
      ? { reasoningEffort: definition.reasoningEffort }
      : {}),
    ...(definition.identity
      ? {
          identity: {
            ...definition.identity,
            values: [...definition.identity.values],
          },
        }
      : {}),
    ...(definition.agentInstructions
      ? { agentInstructions: [...definition.agentInstructions] }
      : {}),
    ...(definition.site ? { site: definition.site } : {}),
    ...(definition.theme ? { theme: definition.theme } : {}),
    ...(definition.bundles
      ? { bundles: definition.bundles.map(normalizeBundle) }
      : {}),
    ...(definition.permissions ? { permissions: definition.permissions } : {}),
    ...(definition.deployment ? { deployment: definition.deployment } : {}),
    ...(definition.evalDisable
      ? {
          evalDisable: definition.evalDisable.map(
            ({ definition: plugin }) => plugin.id,
          ),
        }
      : {}),
  };
}

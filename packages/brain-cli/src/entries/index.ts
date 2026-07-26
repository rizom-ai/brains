/** Public root library export for brain definitions and plugin API compatibility. */

import { defineBundle as validateBundle } from "@brains/app";
import type { CapabilityBundleDefinition as PublicBundleDefinition } from "@brains/app/contracts/brain-definition";

export { defineBrain } from "@brains/app/contracts/brain-definition";
export type {
  BrainAnchorConfigKind,
  BrainDefinition,
  BrainIdentity,
  BrainEnvironment,
  BrainMode,
  PresetName,
  BundleConfigContribution,
  BundlePermissionContribution,
  CapabilityBundleDefinition,
  CapabilityConfig,
  CapabilityContext,
  CapabilityEntry,
  DeploymentConfigInput,
  InterfaceEntry,
  InterfaceConstructor,
  PermissionConfig,
  Plugin,
  PluginFactory,
  PluginConfig,
  ReasoningEffort,
  SitePackage,
} from "@brains/app/contracts/brain-definition";
export function defineBundle(
  definition: PublicBundleDefinition,
): PublicBundleDefinition {
  return validateBundle(
    definition as unknown as Parameters<typeof validateBundle>[0],
  ) as unknown as PublicBundleDefinition;
}

export { PLUGIN_API_VERSION } from "../plugin-api-version";
export { z, ZodError } from "@brains/utils/zod";
export type { ZodSchema, ZodType } from "@brains/utils/zod";

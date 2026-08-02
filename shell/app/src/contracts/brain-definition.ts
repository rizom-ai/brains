/**
 * Public brain definition contract for external authors.
 *
 * The plugin-shaped types below are deliberately narrower than the internal
 * ones: an external author describes a plugin, and never implements the
 * internal `register` hook that the runtime Plugin type demands. That
 * narrowing is why this file cannot simply re-export ../brain-definition.
 *
 * Everything else is re-exported. The structured fields in particular used to
 * be mirrored as `unknown`, which silently cost external authors all checking
 * on `site`, `permissions`, and `deployment` — the fields most worth checking.
 */

import type { PermissionConfig } from "@brains/templates";
import type { CapabilityBundleDefinition } from "../bundle-definition";
import type { SitePackage } from "../site-package";
import type { DeploymentConfigInput, ReasoningEffort } from "../types";
import type {
  BrainAnchorConfigKind,
  BrainEnvironment,
  BrainIdentity,
  CapabilityContext,
  PluginConfig,
} from "../brain-definition";

export type {
  BrainAnchorConfigKind,
  BrainEnvironment,
  BrainIdentity,
  BrainMode,
  CapabilityContext,
  PluginConfig,
} from "../brain-definition";
export type {
  BundleConfigContribution,
  BundlePermissionContribution,
  CapabilityBundleDefinition,
} from "../bundle-definition";
export type { DeploymentConfigInput, ReasoningEffort } from "../types";
export type { SitePackage } from "../site-package";
export type { PermissionConfig } from "@brains/templates";

/** A plugin as an external author declares it — description, not implementation. */
export interface Plugin {
  readonly id: string;
  readonly version: string;
  readonly type: "core" | "entity" | "service" | "interface";
  readonly packageName: string;
  readonly description?: string;
  readonly dependencies?: string[];
  ready?(): Promise<void>;
  shutdown?(): Promise<void>;
  requiresDaemonStartup?(): boolean;
}

export type CapabilityConfig =
  | PluginConfig
  | ((env: BrainEnvironment, context: CapabilityContext) => PluginConfig)
  | undefined;

export type PluginFactory = (config: PluginConfig) => Plugin | Plugin[];

export type CapabilityEntry = [
  id: string,
  factory: PluginFactory,
  config: CapabilityConfig,
];

export type InterfaceConstructor = new (config: PluginConfig) => Plugin;

export type InterfaceEntry = [
  id: string,
  constructor: InterfaceConstructor,
  envMapper: (env: BrainEnvironment) => PluginConfig | null,
];

export interface BrainDefinition {
  name: string;
  version: string;
  anchor?: BrainAnchorConfigKind;
  kind?: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  identity?: BrainIdentity;
  agentInstructions?: string[];
  site?: SitePackage;
  theme?: string;
  capabilities: CapabilityEntry[];
  interfaces: InterfaceEntry[];
  bundles?: CapabilityBundleDefinition[];
  permissions?: PermissionConfig;
  deployment?: DeploymentConfigInput;
  evalDisable?: string[];
  extra?: Record<string, unknown>;
}

export function defineBrain(definition: BrainDefinition): BrainDefinition {
  return definition;
}

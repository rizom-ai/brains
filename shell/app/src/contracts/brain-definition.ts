import {
  isConfiguredPluginDefinition,
  type ConfiguredPluginDefinition,
} from "../configured-plugin";
import { assertIdentifier as assertId } from "@brains/plugins";
import type {
  PluginPackageConfigInput,
  PluginPackageDefinition,
} from "@brains/plugins/public/plugin-api";
import type { PermissionConfig } from "@brains/templates";
import type { SiteDefinition } from "@rizom/site";
import type { DeploymentConfigInput, ReasoningEffort } from "../types";
import type { BrainAnchorConfigKind, BrainIdentity } from "../brain-definition";

export type { PluginPackageDefinition };
export type { ConfiguredPluginDefinition } from "../configured-plugin";
export type {
  BrainAnchorConfigKind,
  BrainIdentity,
  BrainMode,
} from "../brain-definition";
export type { DeploymentConfigInput, ReasoningEffort } from "../types";
export type { PermissionConfig } from "@brains/templates";
export type { SiteDefinition } from "@rizom/site";

export type BundleConfigContribution<
  TMember extends ConfiguredPluginDefinition = ConfiguredPluginDefinition,
> =
  TMember extends ConfiguredPluginDefinition<infer TDefinition>
    ? {
        readonly member: TMember;
        readonly value: Partial<PluginPackageConfigInput<TDefinition>>;
        readonly overrides?: string | undefined;
      }
    : never;

export interface BundlePermissionContribution<
  TMember extends ConfiguredPluginDefinition = ConfiguredPluginDefinition,
> {
  readonly member: TMember;
  readonly config: PermissionConfig;
  readonly overrides?: string | undefined;
}

export interface CapabilityBundleDefinition<
  TMember extends ConfiguredPluginDefinition = ConfiguredPluginDefinition,
  TPolicyTarget extends ConfiguredPluginDefinition = TMember,
> {
  readonly id: string;
  readonly members: readonly TMember[];
  readonly config?:
    readonly BundleConfigContribution<TPolicyTarget>[] | undefined;
  readonly permissions?:
    readonly BundlePermissionContribution<TPolicyTarget>[] | undefined;
  readonly agentInstructions?: readonly string[] | undefined;
  readonly evalDisable?: readonly TPolicyTarget[] | undefined;
}

export interface BrainDefinition<
  TPlugin extends ConfiguredPluginDefinition = ConfiguredPluginDefinition,
> {
  readonly name: string;
  readonly bundleContract?: string | undefined;
  readonly anchor?: BrainAnchorConfigKind | undefined;
  readonly kind?: string | undefined;
  readonly model?: string | undefined;
  readonly reasoningEffort?: ReasoningEffort | undefined;
  readonly identity?: BrainIdentity | undefined;
  readonly agentInstructions?: readonly string[] | undefined;
  readonly site?: SiteDefinition | undefined;
  readonly theme?: string | undefined;
  readonly plugins: readonly TPlugin[];
  readonly bundles?:
    readonly CapabilityBundleDefinition<TPlugin, TPlugin>[] | undefined;
  readonly permissions?: PermissionConfig | undefined;
  readonly deployment?: DeploymentConfigInput | undefined;
  readonly evalDisable?: readonly TPlugin[] | undefined;
}

function assertUniqueMembers(
  members: readonly ConfiguredPluginDefinition[],
  label: string,
): void {
  const seen = new Set<PluginPackageDefinition>();
  const seenIds = new Set<string>();
  for (const member of members) {
    if (!isConfiguredPluginDefinition(member)) {
      throw new Error(
        `${label} contains a value that was not returned by use()`,
      );
    }
    if (seen.has(member.definition)) {
      throw new Error(
        `${label} contains duplicate plugin definition "${member.definition.id}"; include each configured definition only once`,
      );
    }
    if (seenIds.has(member.definition.id)) {
      throw new Error(
        `${label} contains duplicate local plugin id "${member.definition.id}"; give each package definition a unique local id before composing it`,
      );
    }
    seen.add(member.definition);
    seenIds.add(member.definition.id);
  }
}

export function defineBundle<
  const TMembers extends readonly ConfiguredPluginDefinition[],
  const TPolicyTarget extends ConfiguredPluginDefinition = TMembers[number],
>(
  definition: CapabilityBundleDefinition<TMembers[number], TPolicyTarget> & {
    readonly members: TMembers;
  },
): CapabilityBundleDefinition<TMembers[number], TPolicyTarget> {
  assertId(definition.id, "Bundle id");
  assertUniqueMembers(definition.members, `Bundle "${definition.id}"`);

  for (const contribution of definition.config ?? []) {
    if (!isConfiguredPluginDefinition(contribution.member)) {
      throw new Error(
        `Bundle "${definition.id}" config contains a value that was not returned by use()`,
      );
    }
  }
  for (const contribution of definition.permissions ?? []) {
    if (!isConfiguredPluginDefinition(contribution.member)) {
      throw new Error(
        `Bundle "${definition.id}" permissions contains a value that was not returned by use()`,
      );
    }
  }
  for (const member of definition.evalDisable ?? []) {
    if (!isConfiguredPluginDefinition(member)) {
      throw new Error(
        `Bundle "${definition.id}" evalDisable contains a value that was not returned by use()`,
      );
    }
  }

  return Object.freeze({
    ...definition,
    members: Object.freeze([...definition.members]),
    ...(definition.config
      ? { config: Object.freeze([...definition.config]) }
      : {}),
    ...(definition.permissions
      ? { permissions: Object.freeze([...definition.permissions]) }
      : {}),
    ...(definition.agentInstructions
      ? {
          agentInstructions: Object.freeze([...definition.agentInstructions]),
        }
      : {}),
    ...(definition.evalDisable
      ? { evalDisable: Object.freeze([...definition.evalDisable]) }
      : {}),
  });
}

export function defineBrain<
  const TPlugins extends readonly ConfiguredPluginDefinition[],
>(
  definition: BrainDefinition<TPlugins[number]> & {
    readonly plugins: TPlugins;
  },
): BrainDefinition<TPlugins[number]> {
  if (!definition.name.trim()) {
    throw new Error("Brain name must not be empty");
  }
  if (definition.bundleContract?.trim().length === 0) {
    throw new Error("Brain bundleContract must not be empty");
  }
  assertUniqueMembers(definition.plugins, `Brain "${definition.name}"`);

  const plugins = new Set<ConfiguredPluginDefinition>(definition.plugins);
  const bundleIds = new Set<string>();
  for (const bundle of definition.bundles ?? []) {
    if (bundleIds.has(bundle.id)) {
      throw new Error(
        `Brain "${definition.name}" has duplicate bundle "${bundle.id}"`,
      );
    }
    bundleIds.add(bundle.id);
    for (const member of bundle.members) {
      if (!plugins.has(member)) {
        throw new Error(
          `Brain "${definition.name}" bundle "${bundle.id}" references a plugin outside its catalog`,
        );
      }
    }
    for (const contribution of bundle.config ?? []) {
      if (!plugins.has(contribution.member)) {
        throw new Error(
          `Brain "${definition.name}" bundle "${bundle.id}" config references a plugin outside its catalog`,
        );
      }
    }
    for (const contribution of bundle.permissions ?? []) {
      if (!plugins.has(contribution.member)) {
        throw new Error(
          `Brain "${definition.name}" bundle "${bundle.id}" permissions reference a plugin outside its catalog`,
        );
      }
    }
    for (const member of bundle.evalDisable ?? []) {
      if (!plugins.has(member)) {
        throw new Error(
          `Brain "${definition.name}" bundle "${bundle.id}" evalDisable references a plugin outside its catalog`,
        );
      }
    }
  }
  for (const member of definition.evalDisable ?? []) {
    if (!plugins.has(member)) {
      throw new Error(
        `Brain "${definition.name}" evalDisable references a plugin outside its catalog`,
      );
    }
  }

  return Object.freeze({
    ...definition,
    plugins: Object.freeze([...definition.plugins]),
    ...(definition.bundles
      ? { bundles: Object.freeze([...definition.bundles]) }
      : {}),
    ...(definition.agentInstructions
      ? {
          agentInstructions: Object.freeze([...definition.agentInstructions]),
        }
      : {}),
    ...(definition.evalDisable
      ? { evalDisable: Object.freeze([...definition.evalDisable]) }
      : {}),
  });
}

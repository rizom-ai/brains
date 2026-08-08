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
> {
  readonly id: string;
  readonly members: readonly TMember[];
  readonly config?: readonly BundleConfigContribution<TMember>[] | undefined;
  readonly permissions?:
    readonly BundlePermissionContribution<TMember>[] | undefined;
  readonly agentInstructions?: readonly string[] | undefined;
  readonly evalDisable?: readonly TMember[] | undefined;
}

export interface BrainDefinition<
  TPlugin extends ConfiguredPluginDefinition = ConfiguredPluginDefinition,
> {
  readonly name: string;
  readonly anchor?: BrainAnchorConfigKind | undefined;
  readonly kind?: string | undefined;
  readonly model?: string | undefined;
  readonly reasoningEffort?: ReasoningEffort | undefined;
  readonly identity?: BrainIdentity | undefined;
  readonly agentInstructions?: readonly string[] | undefined;
  readonly site?: SiteDefinition | undefined;
  readonly theme?: string | undefined;
  readonly plugins: readonly TPlugin[];
  readonly bundles?: readonly CapabilityBundleDefinition<TPlugin>[] | undefined;
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
        `${label} contains duplicate plugin definition "${member.definition.id}"`,
      );
    }
    if (seenIds.has(member.definition.id)) {
      throw new Error(
        `${label} contains duplicate local plugin id "${member.definition.id}"`,
      );
    }
    seen.add(member.definition);
    seenIds.add(member.definition.id);
  }
}

export function defineBundle<
  const TMembers extends readonly ConfiguredPluginDefinition[],
>(
  definition: CapabilityBundleDefinition<TMembers[number]> & {
    readonly members: TMembers;
  },
): CapabilityBundleDefinition<TMembers[number]> {
  assertId(definition.id, "Bundle id");
  assertUniqueMembers(definition.members, `Bundle "${definition.id}"`);
  const members = new Set<ConfiguredPluginDefinition>(definition.members);

  for (const contribution of definition.config ?? []) {
    if (!members.has(contribution.member)) {
      throw new Error(
        `Bundle "${definition.id}" config references a plugin outside its members`,
      );
    }
  }
  for (const contribution of definition.permissions ?? []) {
    if (!members.has(contribution.member)) {
      throw new Error(
        `Bundle "${definition.id}" permissions reference a plugin outside its members`,
      );
    }
  }
  for (const member of definition.evalDisable ?? []) {
    if (!members.has(member)) {
      throw new Error(
        `Bundle "${definition.id}" evalDisable references a plugin outside its members`,
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

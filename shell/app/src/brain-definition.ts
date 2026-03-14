import type { Plugin } from "@brains/plugins";
import type { PermissionConfig } from "@brains/templates";
import type { DeploymentConfigInput } from "./types";

/**
 * Environment record — the deployment-specific variables
 * passed to interface env mappers and the resolver.
 */
export type BrainEnvironment = Record<string, string | undefined>;

/** Plugin config objects — always key/value records. */
export type PluginConfig = Record<string, unknown>;

/**
 * A capability is a [factory, config] tuple.
 * The factory is called with the config at resolve time to create a fresh plugin instance.
 *
 * Config can be:
 * - A static value (passed directly to the factory)
 * - A function `(env) => config` that receives the deployment environment
 *   (use this when the plugin needs credentials or env-specific settings)
 * - undefined (plugin uses its own defaults)
 */
export type CapabilityConfig =
  | PluginConfig
  | ((env: BrainEnvironment) => PluginConfig)
  | undefined;

export type PluginFactory = (config: PluginConfig) => Plugin;

export type CapabilityEntry = [
  factory: PluginFactory,
  config: CapabilityConfig,
];

/**
 * An interface entry is a [constructor, envMapper] tuple.
 * The envMapper receives the deployment environment and returns the interface config.
 * The constructor is called with `new` to create a fresh interface instance.
 */
export type InterfaceConstructor = new (config: PluginConfig) => Plugin;

export type InterfaceEntry = [
  constructor: InterfaceConstructor,
  envMapper: (env: BrainEnvironment) => PluginConfig | null,
];

/**
 * Brain identity — who this brain is.
 * Pure data, no code references.
 */
export interface BrainIdentity {
  characterName: string;
  role: string;
  purpose: string;
  values: string[];
}

/**
 * Entity route configuration for site building.
 */
export interface EntityRouteEntry {
  label: string;
  pluralName?: string;
  navigation?: {
    show?: boolean;
    slot?: "primary" | "secondary";
    priority?: number;
  };
}

/**
 * Content model — how this brain structures its content.
 */
export interface BrainContentModel {
  seedContentDir?: string;
  entityRoutes?: Record<string, EntityRouteEntry>;
}

/**
 * The brain definition — a reusable model that describes what a brain IS.
 *
 * Key design principles:
 * - No `process.env` — environment is injected at resolve time
 * - Capabilities are [factory, config] tuples, not instantiated plugins
 * - Interfaces are [constructor, envMapper] tuples
 * - Identity, permissions, content model, deployment are pure data
 * - Can be instantiated multiple times with different environments
 */
export interface BrainDefinition {
  /** Brain name (used as app name) */
  name: string;
  /** Semantic version */
  version: string;

  /** Brain identity — character name, role, purpose, values */
  identity?: BrainIdentity;

  /**
   * Capabilities as [factory, config] tuples.
   * Each resolve() call invokes the factories to create fresh plugin instances.
   * Any plugin factory works — no central registry needed.
   */
  capabilities: CapabilityEntry[];

  /**
   * Interfaces as [constructor, envMapper] tuples.
   * The envMapper receives the deployment environment and returns interface config.
   * Interfaces with missing credentials can be skipped by the resolver.
   */
  interfaces: InterfaceEntry[];

  /** Structural permission rules (no credentials) */
  permissions?: PermissionConfig;

  /** Deployment infrastructure config (domain, CDN, DNS) */
  deployment?: DeploymentConfigInput;

  /** Content model — seed content, entity routes */
  contentModel?: BrainContentModel;

  /**
   * Additional config passed directly to the app.
   * Escape hatch for anything not covered by the structured fields above.
   * Values here are merged last and can override resolved config.
   */
  extra?: Record<string, unknown>;
}

/**
 * Define a brain model.
 *
 * This is a simple identity function that provides type checking
 * for brain definitions. It returns the definition as-is.
 *
 * @example
 * ```typescript
 * import { defineBrain } from "@brains/app";
 * import { notePlugin } from "@brains/note";
 * import { MCPInterface } from "@brains/mcp";
 *
 * export default defineBrain({
 *   name: "my-brain",
 *   version: "1.0.0",
 *   identity: {
 *     characterName: "Atlas",
 *     role: "Knowledge manager",
 *     purpose: "Organize and surface knowledge",
 *     values: ["clarity", "accuracy"],
 *   },
 *   capabilities: [
 *     [notePlugin, {}],
 *   ],
 *   interfaces: [
 *     [MCPInterface, (env) => ({ domain: env.DOMAIN })],
 *   ],
 * });
 * ```
 */
export function defineBrain(definition: BrainDefinition): BrainDefinition {
  return definition;
}

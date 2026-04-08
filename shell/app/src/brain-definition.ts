import type { Plugin } from "@brains/plugins";
import type { PermissionConfig } from "@brains/templates";
import type { DeploymentConfigInput } from "./types";
import type { SitePackage } from "./site-package";

import { z } from "@brains/utils";

/**
 * Standard preset names.
 */
export const presetNameSchema = z.enum(["core", "default", "full"]);
export const PresetNames = presetNameSchema.options;
export type PresetName = z.infer<typeof presetNameSchema>;

export const modeSchema = z.enum(["eval"]);
export type BrainMode = z.infer<typeof modeSchema>;

/**
 * Environment record — the deployment-specific variables
 * passed to interface env mappers and the resolver.
 */
export type BrainEnvironment = Record<string, string | undefined>;

/** Plugin config objects — always key/value records. */
export type PluginConfig = Record<string, unknown>;

/**
 * A capability is an [id, factory, config] tuple.
 * The id is used for disable checks and override matching in brain.yaml.
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

/**
 * A plugin factory builds one plugin or — for composite features that bundle
 * an entity + service pair behind one shared config (e.g. newsletter +
 * buttondown) — an array of plugins. Composite sub-plugins are gated as a
 * unit by the capability id; add or remove the entry from a preset to
 * enable/disable all of them.
 */
export type PluginFactory = (config: PluginConfig) => Plugin | Plugin[];

export type CapabilityEntry = [
  id: string,
  factory: PluginFactory,
  config: CapabilityConfig,
];

/**
 * An interface entry is an [id, constructor, envMapper] tuple.
 * The id is used for disable checks and override matching in brain.yaml.
 * The envMapper receives the deployment environment and returns the interface config,
 * or null to skip this interface (e.g. when credentials are missing).
 * The constructor is called with `new` to create a fresh interface instance.
 */
export type InterfaceConstructor = new (config: PluginConfig) => Plugin;

export type InterfaceEntry = [
  id: string,
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
 * The brain definition — a reusable model that describes what a brain IS.
 *
 * Key design principles:
 * - No `process.env` — environment is injected at resolve time
 * - Capabilities are [id, factory, config] tuples, not instantiated plugins
 * - Interfaces are [id, constructor, envMapper] tuples
 * - Identity, permissions, content model, deployment are pure data
 * - Can be instantiated multiple times with different environments
 */
export interface BrainDefinition {
  /** Brain name (used as app name) */
  name: string;
  /** Semantic version */
  version: string;

  /**
   * Default text model for this brain.
   * Can be overridden per-instance via `model` in brain.yaml.
   */
  model?: string;

  /** Brain identity — character name, role, purpose, values */
  identity?: BrainIdentity;

  /**
   * Default site package — layout, routes, site plugin, and display metadata.
   * Can be overridden per-instance via `site.package` in brain.yaml.
   */
  site?: SitePackage;

  /**
   * Default composed theme CSS for the brain instance.
   * Can be overridden per-instance via `site.theme` in brain.yaml.
   */
  theme?: string;

  /**
   * Capabilities as [id, factory, config] tuples.
   * Each resolve() call invokes the factories to create fresh plugin instances.
   * Any plugin factory works — no central registry needed.
   */
  capabilities: CapabilityEntry[];

  /**
   * Interfaces as [id, constructor, envMapper] tuples.
   * The envMapper receives the deployment environment and returns interface config,
   * or null to skip (e.g. when credentials are missing).
   */
  interfaces: InterfaceEntry[];

  /**
   * Named presets — curated subsets of capabilities + interfaces.
   * Each key maps to an array of plugin/interface IDs to enable.
   * Standard names: "core", "default", "full", "eval".
   * Custom names are allowed.
   */
  presets?: Partial<Record<PresetName, string[]>>;

  /** Default preset name when brain.yaml doesn't specify one. */
  defaultPreset?: PresetName;

  /** Structural permission rules (no credentials) */
  permissions?: PermissionConfig;

  /** Deployment infrastructure config (domain, CDN, DNS) */
  deployment?: DeploymentConfigInput;

  /**
   * Plugin/interface IDs to disable when running in eval mode.
   * These are plugins with external side effects (chat, email, analytics, etc.)
   * that should not run during evaluation.
   */
  evalDisable?: string[];

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
 *     ["note", notePlugin, {}],
 *   ],
 *   interfaces: [
 *     ["mcp", MCPInterface, (env) => ({ domain: env.DOMAIN })],
 *   ],
 * });
 * ```
 */
export function defineBrain(definition: BrainDefinition): BrainDefinition {
  return definition;
}

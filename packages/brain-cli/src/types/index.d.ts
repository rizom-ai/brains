/** Public root library export for brain definitions and plugin API compatibility. */

import type { Plugin } from "./plugins";

export const PLUGIN_API_VERSION: string;

export type BrainEnvironment = Record<string, string | undefined>;
export type PluginConfig = Record<string, unknown>;
export type CapabilityConfig =
  | PluginConfig
  | ((env: BrainEnvironment) => PluginConfig)
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
export type PresetName = "core" | "default" | "full";
export type BrainMode = "eval";

export interface BrainIdentity {
  characterName: string;
  role: string;
  purpose: string;
  values: string[];
}
export interface BrainDefinition {
  name: string;
  version: string;
  model?: string;
  identity?: BrainIdentity;
  site?: unknown;
  theme?: string;
  capabilities: CapabilityEntry[];
  interfaces: InterfaceEntry[];
  presets?: Partial<Record<PresetName, string[]>>;
  defaultPreset?: PresetName;
  permissions?: unknown;
  deployment?: unknown;
  evalDisable?: string[];
  extra?: Record<string, unknown>;
}
export function defineBrain(definition: BrainDefinition): BrainDefinition;

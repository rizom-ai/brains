import type { BrainDefinition, PresetName } from "../brain-definition";
import type { CapabilityBundleDefinition } from "../bundle-definition";
import {
  resolveBundleSelection,
  type BundleSelectionResolution,
} from "../bundle-resolution";
import type { InstanceOverrides } from "../instance-overrides";

/** `null` means "no explicit selection", which activates every id. */
export type ActiveIds = Set<string> | null;
export type PluginOverrides = Record<string, Record<string, unknown>>;

export interface ResolvedBrainSelection {
  activeIds: ActiveIds;
  activePreset: PresetName | undefined;
  activeBundles: readonly string[];
  bundleDefinitions: readonly CapabilityBundleDefinition[];
  resolution: BundleSelectionResolution;
}

export function resolveActivePresetName(
  definition: BrainDefinition,
  overrides?: Omit<InstanceOverrides, "brain">,
): PresetName | undefined {
  if (!definition.presets) return undefined;

  const presetName: PresetName =
    overrides?.preset ?? definition.defaultPreset ?? "default";
  const preset = definition.presets[presetName];

  if (!preset) {
    throw new Error(
      `Unknown preset "${presetName}". Available: ${Object.keys(definition.presets).join(", ")}`,
    );
  }

  return presetName;
}

export function resolveBrainSelection(
  definition: BrainDefinition,
  overrides?: Omit<InstanceOverrides, "brain">,
): ResolvedBrainSelection {
  if (overrides?.preset && overrides.bundles !== undefined) {
    throw new Error('"preset" and "bundles" are mutually exclusive');
  }

  const catalogIds = [
    ...definition.capabilities.map(([id]) => id),
    ...definition.interfaces.map(([id]) => id),
  ];
  const sharedInput = {
    catalogIds,
    mode: overrides?.mode,
    evalDisable: definition.evalDisable,
    add: overrides?.add,
    remove: overrides?.remove,
  } as const;

  if (overrides?.bundles !== undefined) {
    const bundleDefinitions = definition.bundles ?? [];
    const resolution = resolveBundleSelection({
      ...sharedInput,
      definitions: bundleDefinitions,
      selected: overrides.bundles,
    });
    return {
      activeIds: new Set(resolution.activeMembers),
      activePreset: undefined,
      activeBundles: resolution.activeBundles,
      bundleDefinitions,
      resolution,
    };
  }

  const activePreset = resolveActivePresetName(definition, overrides);
  const catalog = new Set(catalogIds);
  const legacyMembers = activePreset
    ? (definition.presets?.[activePreset] ?? []).filter((id) => catalog.has(id))
    : catalogIds;
  const legacyBundle: CapabilityBundleDefinition = {
    id: "__legacy-selection__",
    members: [...new Set(legacyMembers)],
  };
  const resolution = resolveBundleSelection({
    ...sharedInput,
    definitions: [legacyBundle],
    selected: [legacyBundle.id],
  });

  return {
    activeIds: activePreset ? new Set(resolution.activeMembers) : null,
    activePreset,
    activeBundles: [],
    bundleDefinitions: [],
    resolution,
  };
}

/** Determine which plugin/interface IDs are active. */
export function resolveActiveIds(
  definition: BrainDefinition,
  overrides?: Omit<InstanceOverrides, "brain">,
): ActiveIds {
  return resolveBrainSelection(definition, overrides).activeIds;
}

export function isActive(activeIds: ActiveIds, id: string): boolean {
  return !activeIds || activeIds.has(id);
}

export function hasActiveInterface(
  definition: BrainDefinition,
  activeIds: ActiveIds,
  id: string,
): boolean {
  return activeIds
    ? activeIds.has(id)
    : definition.interfaces.some(([interfaceId]) => interfaceId === id);
}

export function hasActiveCapability(
  definition: BrainDefinition,
  activeIds: ActiveIds,
  id: string,
): boolean {
  return activeIds
    ? activeIds.has(id)
    : definition.capabilities.some(([capabilityId]) => capabilityId === id);
}

import type { BrainDefinition, PresetName } from "../brain-definition";
import type { InstanceOverrides } from "../instance-overrides";

/** `null` means "no presets declared", which activates every id. */
export type ActiveIds = Set<string> | null;
export type PluginOverrides = Record<string, Record<string, unknown>>;

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

/**
 * Determine which plugin/interface IDs are active.
 *
 * Priority:
 * 1. If presets are defined: use preset (from overrides or defaultPreset),
 *    then apply add/remove
 * 2. If no presets: all IDs are active
 */
export function resolveActiveIds(
  definition: BrainDefinition,
  overrides?: Omit<InstanceOverrides, "brain">,
): ActiveIds {
  const allIds = new Set([
    ...definition.capabilities.map(([id]) => id),
    ...definition.interfaces.map(([id]) => id),
  ]);

  const presetName = resolveActivePresetName(definition, overrides);
  if (!definition.presets || !presetName) return null;

  const activeIds = new Set(definition.presets[presetName]);

  // Eval mode: remove plugins with external side effects
  if (overrides?.mode === "eval" && definition.evalDisable) {
    for (const id of definition.evalDisable) {
      activeIds.delete(id);
    }
  }

  // Add: union with preset (only IDs that exist in brain definition)
  if (overrides?.add) {
    for (const id of overrides.add) {
      if (allIds.has(id)) {
        activeIds.add(id);
      }
    }
  }

  // Remove: difference from preset
  if (overrides?.remove) {
    for (const id of overrides.remove) {
      activeIds.delete(id);
    }
  }

  return activeIds;
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

import type { BrainDefinition } from "../brain-definition";
import type { CapabilityBundleDefinition } from "../bundle-definition";
import {
  resolveBundleSelection,
  type BundleSelectionResolution,
} from "../bundle-resolution";
import type { InstanceOverrides } from "../instance-overrides";

export type ActiveIds = Set<string>;
export type PluginOverrides = Record<string, Record<string, unknown>>;

export interface ResolvedBrainSelection {
  activeIds: ActiveIds;
  activeBundles: readonly string[];
  bundleDefinitions: readonly CapabilityBundleDefinition[];
  resolution: BundleSelectionResolution;
}

/**
 * The webserver interface became the runtime's HTTP host: a brain.yaml that
 * still configures or selects it is refused with where its settings went,
 * rather than booting with them ignored.
 */
function refuseRetiredWebserver(
  overrides: Omit<InstanceOverrides, "brain"> | undefined,
): void {
  if (Object.hasOwn(overrides?.plugins ?? {}, "webserver")) {
    throw new Error(
      'brain.yaml "plugins.webserver" is retired: the runtime hosts HTTP. Set the production port with top-level "port" and serving settings under "http" (enabled, preview, hostname, productionDistDir, previewDistDir, sharedImagesDir); preview shares the production port.',
    );
  }
  for (const list of ["add", "remove"] as const) {
    if (overrides?.[list]?.includes("webserver") === true) {
      throw new Error(
        `brain.yaml ${list} names "webserver", which is retired: the runtime hosts HTTP. Choose it with "http.enabled" instead.`,
      );
    }
  }
}

export function resolveBrainSelection(
  definition: BrainDefinition,
  overrides?: Omit<InstanceOverrides, "brain">,
): ResolvedBrainSelection {
  refuseRetiredWebserver(overrides);
  if (
    overrides?.add?.includes("cms") === true ||
    overrides?.remove?.includes("cms") === true ||
    Object.hasOwn(overrides?.plugins ?? {}, "cms")
  ) {
    throw new Error(
      'brain.yaml still references retired member "cms"; run `brain config migrate` to rename it to "studio"',
    );
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

  const bundleDefinitions = definition.bundles ?? [];
  if (overrides?.bundles !== undefined) {
    const resolution = resolveBundleSelection({
      ...sharedInput,
      definitions: bundleDefinitions,
      selected: overrides.bundles,
    });
    return {
      activeIds: new Set(resolution.activeMembers),
      activeBundles: resolution.activeBundles,
      bundleDefinitions,
      resolution,
    };
  }

  if (bundleDefinitions.length > 0) {
    throw new Error(
      'brain.yaml must select explicit "bundles"; run `brain config migrate` for legacy configs',
    );
  }

  const completeCatalogBundle: CapabilityBundleDefinition = {
    id: "__complete-catalog__",
    members: [...new Set(catalogIds)],
  };
  const resolution = resolveBundleSelection({
    ...sharedInput,
    definitions: [completeCatalogBundle],
    selected: [completeCatalogBundle.id],
  });

  return {
    activeIds: new Set(resolution.activeMembers),
    activeBundles: [],
    bundleDefinitions: [],
    resolution,
  };
}

export function resolveActiveIds(
  definition: BrainDefinition,
  overrides?: Omit<InstanceOverrides, "brain">,
): ActiveIds {
  return resolveBrainSelection(definition, overrides).activeIds;
}

export function isActive(activeIds: ActiveIds, id: string): boolean {
  return activeIds.has(id);
}

export function hasActiveCapability(
  _definition: BrainDefinition,
  activeIds: ActiveIds,
  id: string,
): boolean {
  return activeIds.has(id);
}

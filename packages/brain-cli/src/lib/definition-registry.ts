import {
  isDeclarativeBrainDefinition,
  normalizeDeclarativeBrainDefinition,
  registerBrainDefinitionPackages,
  type BrainDefinition,
} from "@brains/app";
import type { BrainDefinition as DeclarativeBrainDefinition } from "@brains/app/contracts/brain-definition";

type LoadableBrainDefinition = BrainDefinition | DeclarativeBrainDefinition;

function withRuntimeOwnedInterfaceHost(
  definition: DeclarativeBrainDefinition,
): BrainDefinition {
  const normalized = normalizeDeclarativeBrainDefinition(definition);
  if (
    !definition.plugins.some(
      ({ definition: plugin }) => plugin.family === "interface",
    )
  ) {
    return normalized;
  }
  const alreadyHostsRoutes =
    normalized.interfaces.some(([id]) => id === "webserver") ||
    normalized.capabilities.some(([id]) => id === "webserver");
  if (alreadyHostsRoutes) return normalized;

  const webserver = getCanonicalDefinition().interfaces.find(
    ([id]) => id === "webserver",
  );
  if (!webserver) {
    throw new Error("Canonical runtime has no webserver interface host");
  }
  return {
    ...normalized,
    interfaces: [...normalized.interfaces, webserver],
    ...(normalized.bundles
      ? {
          bundles: normalized.bundles.map((bundle) => ({
            ...bundle,
            members: [...bundle.members, "webserver"],
          })),
        }
      : {}),
  };
}

let canonicalDefinition: BrainDefinition | undefined;

/** Install the one bundled canonical definition during package startup. */
export function setCanonicalDefinition(definition: BrainDefinition): void {
  canonicalDefinition = definition;
}

export function getCanonicalDefinition(): BrainDefinition {
  if (!canonicalDefinition) {
    throw new Error("Canonical brain definition is not registered");
  }
  return canonicalDefinition;
}

export function hasCanonicalDefinition(): boolean {
  return canonicalDefinition !== undefined;
}

function isRuntimeBrainDefinition(value: unknown): value is BrainDefinition {
  return (
    value !== null &&
    typeof value === "object" &&
    "capabilities" in value &&
    Array.isArray(value.capabilities) &&
    "interfaces" in value &&
    Array.isArray(value.interfaces)
  );
}

/** Load the bundled canonical definition or an explicitly scoped external one. */
export async function loadDefinition(
  name: string,
): Promise<LoadableBrainDefinition> {
  if (name === "brain") return getCanonicalDefinition();
  const module = await import(name);
  const definition: unknown = module.default;
  if (
    !isRuntimeBrainDefinition(definition) &&
    !isDeclarativeBrainDefinition(definition)
  ) {
    throw new Error(
      `Brain definition package "${name}" has no valid default definition export`,
    );
  }
  await registerBrainDefinitionPackages(name, definition, process.cwd());
  return isDeclarativeBrainDefinition(definition)
    ? withRuntimeOwnedInterfaceHost(definition)
    : definition;
}

export function resetCanonicalDefinition(): void {
  canonicalDefinition = undefined;
}

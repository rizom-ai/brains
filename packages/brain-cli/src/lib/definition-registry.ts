import type { BrainDefinition } from "@brains/app";

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

/** Load the bundled canonical definition or an explicitly scoped external one. */
export async function loadDefinition(name: string): Promise<BrainDefinition> {
  if (name === "brain") return getCanonicalDefinition();
  const module = await import(name);
  if (!module.default) {
    throw new Error(`Brain definition package "${name}" has no default export`);
  }
  return module.default;
}

export function resetCanonicalDefinition(): void {
  canonicalDefinition = undefined;
}

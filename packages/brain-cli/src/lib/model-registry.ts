/**
 * Brain model registry.
 *
 * Known model names are listed statically. Model definitions are registered
 * at runtime by the build entrypoint (bundled package) or left empty
 * (monorepo — falls back to subprocess runner).
 */

const AVAILABLE_MODELS = ["rover"] as const;

export type ModelName = (typeof AVAILABLE_MODELS)[number];

// Registered model definitions — populated by the build entrypoint
const models = new Map<string, unknown>();

/**
 * Normalize a brain model reference to a bare name.
 *
 * Accepts:
 * - "rover"              → "rover"
 * - "@brains/rover"      → "rover"
 * - '"@brains/rover"'    → "rover"
 */
export function resolveModelName(raw: string): string {
  let name = raw.trim();

  // Strip quotes
  if (
    (name.startsWith('"') && name.endsWith('"')) ||
    (name.startsWith("'") && name.endsWith("'"))
  ) {
    name = name.slice(1, -1);
  }

  // Strip @brains/ prefix
  if (name.startsWith("@brains/")) {
    name = name.replace("@brains/", "");
  }

  return name;
}

/**
 * Get the list of known model names.
 */
export function getAvailableModels(): readonly string[] {
  return AVAILABLE_MODELS;
}

/**
 * Check if a model name is a known built-in model.
 */
export function isBuiltinModel(name: string): name is ModelName {
  return AVAILABLE_MODELS.includes(name as ModelName);
}

/**
 * Register a model definition.
 * Called by the build entrypoint after bundling models.
 */
export function registerModel(name: string, definition: unknown): void {
  models.set(name, definition);
}

/**
 * Get a registered model definition.
 * Returns undefined if the model is not registered (monorepo mode).
 */
export function getModel(name: string): unknown | undefined {
  return models.get(name);
}

/**
 * Check if any models are registered (bundled mode vs monorepo).
 */
export function hasRegisteredModels(): boolean {
  return models.size > 0;
}

/**
 * Reset registered models. For testing only.
 */
export function resetModels(): void {
  models.clear();
}

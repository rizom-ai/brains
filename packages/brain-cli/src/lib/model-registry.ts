/**
 * Built-in brain model registry.
 *
 * Maps model names to their package imports. In the bundled @rizom/brain
 * package, these are statically imported. In the monorepo, they resolve
 * via workspace dependencies.
 */

const AVAILABLE_MODELS = ["rover", "ranger", "relay"] as const;

export type ModelName = (typeof AVAILABLE_MODELS)[number];

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
 * Get the list of built-in model names.
 */
export function getAvailableModels(): readonly string[] {
  return AVAILABLE_MODELS;
}

/**
 * Check if a model name is a built-in model.
 */
export function isBuiltinModel(name: string): name is ModelName {
  return AVAILABLE_MODELS.includes(name as ModelName);
}

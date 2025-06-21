import * as yaml from "js-yaml";

/**
 * Convert an object to YAML string
 */
export function toYaml(content: unknown): string {
  return yaml.dump(content, {
    skipInvalid: true,
    noRefs: true,
    sortKeys: true,
  });
}

/**
 * Parse YAML string to object
 */
export function fromYaml<T = unknown>(yamlContent: string): T {
  return yaml.load(yamlContent) as T;
}

/**
 * Check if a string is valid YAML
 */
export function isValidYaml(yamlContent: string): boolean {
  try {
    yaml.load(yamlContent);
    return true;
  } catch {
    return false;
  }
}

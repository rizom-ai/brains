/**
 * Type-safe property access utilities
 */

/**
 * Safely get a property from an unknown object
 */
export function getProp(obj: unknown, key: string): unknown {
  if (typeof obj === "object" && obj !== null && key in obj) {
    return (obj as Record<string, unknown>)[key];
  }
  return undefined;
}

/**
 * Get a string property or default
 */
export function getStringProp(
  obj: unknown,
  key: string,
  defaultValue = "",
): string {
  const value = getProp(obj, key);
  return typeof value === "string" ? value : defaultValue;
}

/**
 * Get a number property or default
 */
export function getNumberProp(
  obj: unknown,
  key: string,
  defaultValue = 0,
): number {
  const value = getProp(obj, key);
  return typeof value === "number" ? value : defaultValue;
}

/**
 * Get a boolean property or default
 */
export function getBooleanProp(
  obj: unknown,
  key: string,
  defaultValue = false,
): boolean {
  const value = getProp(obj, key);
  return typeof value === "boolean" ? value : defaultValue;
}

/**
 * Get an array property or default
 */
export function getArrayProp<T = unknown>(
  obj: unknown,
  key: string,
  defaultValue: T[] = [],
): T[] {
  const value = getProp(obj, key);
  return Array.isArray(value) ? (value as T[]) : defaultValue;
}

/**
 * Check if object has all specified properties
 */
export function hasProps(obj: unknown, keys: string[]): boolean {
  if (typeof obj !== "object" || obj === null) return false;
  const record = obj as Record<string, unknown>;
  return keys.every((key) => key in record);
}

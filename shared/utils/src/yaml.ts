import * as yaml from "js-yaml";
import type { z } from "zod";

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

export interface YamlParseSuccess<T> {
  ok: true;
  data: T;
}
export interface YamlParseFailure {
  ok: false;
  error: string;
}
export type YamlParseResult<T> = YamlParseSuccess<T> | YamlParseFailure;

/**
 * Parse a YAML string, validate it's an object, and optionally validate
 * against a Zod schema.
 *
 * Without a schema: returns Record<string, unknown>.
 * With a schema: returns the validated, typed data.
 *
 * Returns { ok: true, data } on success, { ok: false, error } on failure.
 * Handles: invalid YAML syntax, empty files, non-object results, schema validation.
 */
export function parseYamlDocument(
  content: string,
): YamlParseResult<Record<string, unknown>>;
export function parseYamlDocument<T>(
  content: string,
  schema: z.ZodType<T>,
): YamlParseResult<T>;
export function parseYamlDocument<T = Record<string, unknown>>(
  content: string,
  schema?: z.ZodType<T>,
): YamlParseResult<T> {
  if (!content.trim()) {
    return { ok: false, error: "file is empty" };
  }

  let raw: unknown;
  try {
    raw = yaml.load(content);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "YAML parse error",
    };
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "expected a YAML mapping (key: value pairs)" };
  }

  if (!schema) {
    return { ok: true, data: raw as T };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const fields = result.error.issues.map((i) => i.path.join(".")).join(", ");
    return { ok: false, error: `invalid field(s): ${fields}` };
  }

  return { ok: true, data: result.data };
}

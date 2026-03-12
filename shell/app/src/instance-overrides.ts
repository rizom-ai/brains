/**
 * Instance overrides — parsed from brain.yaml.
 *
 * These are deployment-specific settings that vary between instances
 * of the same brain model. Secrets stay in .env; everything else
 * goes here.
 */
export interface InstanceOverrides {
  /** Brain package name (required) */
  brain?: string;

  /** Override instance name */
  name?: string;

  /** Log level: debug | info | warn | error */
  logLevel?: "debug" | "info" | "warn" | "error";

  /** Production server port */
  port?: number;

  /** Production domain */
  domain?: string;

  /** Database URL */
  database?: string;

  /** Plugin IDs to disable for this instance */
  disable?: string[];

  /** Anchor users (full admin access) — overrides brain model */
  anchors?: string[];

  /** Trusted users (elevated access) — overrides brain model */
  trusted?: string[];

  /** Per-plugin config overrides, keyed by plugin ID */
  plugins?: Record<string, Record<string, unknown>>;
}

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value);
}

/**
 * Parse a brain.yaml string into InstanceOverrides.
 *
 * This is a minimal YAML parser that handles the flat structure
 * of brain.yaml plus the nested `plugins:` and `disable:` sections.
 * No external YAML dependency needed.
 */
export function parseInstanceOverrides(yaml: string): InstanceOverrides {
  const result: InstanceOverrides = {};
  const lines = yaml.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (trimmed === "" || trimmed.startsWith("#")) {
      i++;
      continue;
    }

    // Top-level key: value
    const kvMatch = trimmed.match(/^(\w[\w-]*):\s*(.*)/);
    if (!kvMatch) {
      i++;
      continue;
    }

    const key = kvMatch[1] ?? "";
    const value = stripComment((kvMatch[2] ?? "").trim());

    if (key === "brain") {
      result.brain = unquote(value);
    } else if (key === "name") {
      result.name = unquote(value);
    } else if (key === "logLevel") {
      const level = unquote(value);
      if (isLogLevel(level)) {
        result.logLevel = level;
      }
    } else if (key === "port") {
      const n = Number(value);
      if (!isNaN(n)) result.port = n;
    } else if (key === "domain") {
      result.domain = unquote(value);
    } else if (key === "database") {
      result.database = unquote(value);
    } else if (key === "disable") {
      i = parseStringList(lines, i, value, result, "disable");
      continue;
    } else if (key === "anchors") {
      i = parseStringList(lines, i, value, result, "anchors");
      continue;
    } else if (key === "trusted") {
      i = parseStringList(lines, i, value, result, "trusted");
      continue;
    } else if (key === "plugins") {
      i = parsePluginsSection(lines, i, result);
      continue;
    }

    i++;
  }

  return result;
}

/** Parse a string list field (inline or block list) */
function parseStringList(
  lines: string[],
  i: number,
  value: string,
  result: InstanceOverrides,
  field: "disable" | "anchors" | "trusted",
): number {
  // Inline list: [a, b, c]
  const inlineMatch = value.match(/^\[([^\]]*)\]$/);
  if (inlineMatch) {
    result[field] = (inlineMatch[1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return i + 1;
  }

  // Block list follows
  const items: string[] = [];
  i++;
  while (i < lines.length) {
    const item = (lines[i] ?? "").trim();
    if (item.startsWith("- ")) {
      items.push(unquote(item.slice(2).trim()));
      i++;
    } else if (item === "" || item.startsWith("#")) {
      i++;
    } else {
      break;
    }
  }
  result[field] = items;
  return i;
}

/** Parse the plugins: nested section */
function parsePluginsSection(
  lines: string[],
  i: number,
  result: InstanceOverrides,
): number {
  result.plugins = {};
  i++;
  let currentPlugin: string | undefined;

  while (i < lines.length) {
    const pLine = lines[i] ?? "";
    const pTrimmed = pLine.trim();

    // Stop at next top-level key (no leading whitespace, non-empty, not a comment)
    if (
      pTrimmed !== "" &&
      !pTrimmed.startsWith("#") &&
      !pLine.startsWith(" ") &&
      !pLine.startsWith("\t")
    ) {
      break;
    }

    if (pTrimmed === "" || pTrimmed.startsWith("#")) {
      i++;
      continue;
    }

    // Indentation level determines if it's a plugin ID or a config key
    const indent = pLine.length - pLine.trimStart().length;

    if (indent <= 2) {
      // Plugin ID line: "  pluginId:"
      const pluginMatch = pTrimmed.match(/^([\w][\w-]*):\s*$/);
      if (pluginMatch) {
        currentPlugin = pluginMatch[1];
        if (currentPlugin) {
          result.plugins[currentPlugin] = {};
        }
      }
    } else if (currentPlugin && indent > 2) {
      // Config key: "    key: value"
      const configMatch = pTrimmed.match(/^([\w][\w-]*):\s*(.*)/);
      if (configMatch) {
        const configKey = configMatch[1] ?? "";
        const configValue = stripComment((configMatch[2] ?? "").trim());
        const pluginConfig = result.plugins[currentPlugin];
        if (pluginConfig) {
          pluginConfig[configKey] = parseValue(configValue);
        }
      }
    }

    i++;
  }
  return i;
}

/** Remove trailing inline comments */
function stripComment(value: string): string {
  // Don't strip # inside quotes
  if (value.startsWith('"') || value.startsWith("'")) return value;
  const hashIdx = value.indexOf(" #");
  return hashIdx >= 0 ? value.slice(0, hashIdx).trim() : value;
}

/** Remove surrounding quotes */
function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/** Parse a scalar YAML value to a JS value */
function parseValue(value: string): unknown {
  const unquoted = unquote(value);

  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;

  const num = Number(value);
  if (!isNaN(num) && value !== "") return num;

  return unquoted;
}

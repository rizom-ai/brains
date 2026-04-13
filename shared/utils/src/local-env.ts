import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export function readLocalEnvValues(cwd: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const envPath of [join(cwd, ".env"), join(cwd, ".env.local")]) {
    if (!existsSync(envPath)) {
      continue;
    }

    const parsed = parseLocalEnv(readFileSync(envPath, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      values[key] = value;
    }
  }

  return values;
}

export function resolveLocalEnvValue(
  key: string,
  env: NodeJS.ProcessEnv,
  localEnvValues: Record<string, string>,
): string | undefined {
  return env[key] ?? localEnvValues[key];
}

export function resolveLocalPath(filePath: string, cwd: string): string {
  if (filePath.startsWith("~/")) {
    return join(process.env["HOME"] ?? homedir(), filePath.slice(2));
  }

  if (isAbsolute(filePath)) {
    return filePath;
  }

  return resolve(cwd, filePath);
}

function parseLocalEnv(content: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const match = rawLine.match(
      /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/,
    );
    const key = match?.[1];
    const rawValue = match?.[2];
    if (!key || rawValue === undefined) {
      continue;
    }

    values[key] = unquoteEnvValue(rawValue);
  }

  return values;
}

function unquoteEnvValue(value: string): string {
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }

  return value;
}

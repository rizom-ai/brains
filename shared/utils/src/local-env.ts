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
      if (typeof value === "string" && /^[A-Z][A-Z0-9_]*$/.test(key)) {
        values[key] = value;
      }
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
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    values[key] = unquoteEnvValue(rawValue);
  }

  return values;
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

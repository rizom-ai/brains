import { appendFileSync, readFileSync } from "node:fs";

export async function readJsonResponse(
  response: Response,
  label: string,
): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    throw new Error(`${label} returned an empty response (${response.status})`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `${label} returned invalid JSON (${response.status}): ${text}`,
    );
  }
}

export function parseEnvFile(filePath: string): Record<string, string> {
  const text = readFileSync(filePath, "utf8");
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line: string) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

export interface EnvSchemaEntry {
  key: string;
  required: boolean;
  sensitive: boolean;
}

export function parseEnvSchema(content: string): EnvSchemaEntry[] {
  const entries: EnvSchemaEntry[] = [];
  const seen = new Set<string>();
  let nextRequired = false;
  let nextSensitive = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.startsWith("#")) {
      if (line.includes("@required")) nextRequired = true;
      if (line.includes("@sensitive")) nextSensitive = true;
      continue;
    }

    const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
    if (!match?.[1]) {
      nextRequired = false;
      nextSensitive = false;
      continue;
    }

    const key = match[1];
    if (!seen.has(key)) {
      seen.add(key);
      entries.push({ key, required: nextRequired, sensitive: nextSensitive });
    }
    nextRequired = false;
    nextSensitive = false;
  }

  return entries;
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

export function writeGitHubOutput(key: string, value: string): void {
  const outputPath = process.env["GITHUB_OUTPUT"];
  if (outputPath) {
    appendFileSync(outputPath, `${key}=${value}\n`);
  }
}

export function writeGitHubEnv(key: string, value: string): void {
  const envPath = process.env["GITHUB_ENV"];
  if (envPath) {
    appendFileSync(envPath, `${key}=${value}\n`);
  }
}

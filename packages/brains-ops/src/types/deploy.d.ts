export function parseTursoBackupManifest(value: unknown): {
  git: { head: string; branch: string };
  databases: Array<{ name: string; sha256: string }>;
  artifacts: Array<{ name: string; sha256: string }>;
};

export function parseBackupRuntimeEnvironment(value: unknown): string[];

export interface EnvSchemaEntry {
  key: string;
  required: boolean;
  sensitive: boolean;
}

export function readJsonResponse(
  response: Response,
  label: string,
): Promise<unknown>;

export function parseEnvFile(filePath: string): Record<string, string>;

export function parseEnvSchema(
  content: string,
  options?: { skipSections?: Set<string> },
): EnvSchemaEntry[];

export function parseEnvSchemaFile(
  filePath: string,
  options?: { skipSections?: Set<string> },
): EnvSchemaEntry[];

export function requireEnv(name: string): string;

export function writeGitHubOutput(key: string, value: string): void;

export function writeGitHubEnv(key: string, value: string): void;

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { parseYamlDocument } from "@brains/utils";

import { type CohortConfig, cohortSchema, handleSchema } from "./schema";

export interface AddPilotUserOptions {
  cohort: string;
  anchorId?: string | undefined;
}

export interface AddPilotUserResult {
  handle: string;
  cohort: string;
  userPath: string;
  secretsTemplatePath: string;
  cohortPath: string;
  createdUser: boolean;
  createdSecretsTemplate: boolean;
  addedToCohort: boolean;
}

export async function addPilotUser(
  rootDir: string,
  handle: string,
  options: AddPilotUserOptions,
): Promise<AddPilotUserResult> {
  const parsedHandle = handleSchema.parse(handle);
  const parsedCohort = handleSchema.parse(options.cohort);
  const usersDir = join(rootDir, "users");
  const cohortsDir = join(rootDir, "cohorts");
  const userPath = join(usersDir, `${parsedHandle}.yaml`);
  const secretsTemplatePath = join(usersDir, `${parsedHandle}.secrets.yaml`);
  const encryptedSecretsPath = join(
    usersDir,
    `${parsedHandle}.secrets.yaml.age`,
  );
  const cohortPath = join(cohortsDir, `${parsedCohort}.yaml`);

  await Promise.all([
    mkdir(usersDir, { recursive: true }),
    mkdir(cohortsDir, { recursive: true }),
  ]);

  const createdUser = await writeFileIfMissing(
    userPath,
    formatUserFile(parsedHandle, options.anchorId),
  );

  const hasEncryptedSecrets = await fileExists(encryptedSecretsPath);
  const createdSecretsTemplate = hasEncryptedSecrets
    ? false
    : await writeFileIfMissing(
        secretsTemplatePath,
        formatSecretsTemplate(parsedHandle),
      );

  const { addedToCohort } = await addUserToCohort(cohortPath, parsedHandle);

  return {
    handle: parsedHandle,
    cohort: parsedCohort,
    userPath,
    secretsTemplatePath,
    cohortPath,
    createdUser,
    createdSecretsTemplate,
    addedToCohort,
  };
}

async function addUserToCohort(
  cohortPath: string,
  handle: string,
): Promise<{ addedToCohort: boolean }> {
  const existing = await readExistingCohort(cohortPath);

  if (existing.members.includes(handle)) {
    return { addedToCohort: false };
  }

  const next = {
    ...existing,
    members: [...existing.members, handle].sort(),
  };
  await writeFile(cohortPath, formatCohortFile(next));
  return { addedToCohort: true };
}

async function readExistingCohort(cohortPath: string): Promise<CohortConfig> {
  try {
    const content = await readFile(cohortPath, "utf8");
    const result = parseYamlDocument(content, cohortSchema);
    if (!result.ok) {
      throw new Error(`${basename(cohortPath)}: ${result.error}`);
    }
    return result.data;
  } catch (error) {
    if (isNotFoundError(error)) {
      return { members: [] };
    }
    throw error;
  }
}

function formatUserFile(handle: string, anchorId: string | undefined): string {
  return [
    `handle: ${handle}`,
    "anchorProfile:",
    `  name: ${handleToDisplayName(handle)}`,
    "discord:",
    "  enabled: true",
    ...(anchorId ? [`  anchorUserId: ${JSON.stringify(anchorId)}`] : []),
    "",
  ].join("\n");
}

function formatSecretsTemplate(handle: string): string {
  return [
    "# local per-user secret staging file",
    `# fill values, run \`bunx brains-ops secrets:encrypt . ${handle}\`, then the plaintext file will be removed`,
    "discordBotToken: ",
    "",
  ].join("\n");
}

function formatCohortFile(cohort: CohortConfig): string {
  return [
    "members:",
    ...cohort.members.map((member) => `  - ${member}`),
    ...(cohort.brainVersionOverride
      ? [`brainVersionOverride: ${cohort.brainVersionOverride}`]
      : []),
    ...(cohort.presetOverride
      ? [`presetOverride: ${cohort.presetOverride}`]
      : []),
    ...(cohort.aiApiKeyOverride
      ? [`aiApiKeyOverride: ${cohort.aiApiKeyOverride}`]
      : []),
    ...(cohort.gitSyncTokenOverride
      ? [`gitSyncTokenOverride: ${cohort.gitSyncTokenOverride}`]
      : []),
    ...(cohort.mcpAuthTokenOverride
      ? [`mcpAuthTokenOverride: ${cohort.mcpAuthTokenOverride}`]
      : []),
    "",
  ].join("\n");
}

async function writeFileIfMissing(
  path: string,
  content: string,
): Promise<boolean> {
  try {
    await writeFile(path, content, { flag: "wx" });
    return true;
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      return false;
    }
    throw error;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isAlreadyExistsError(error: unknown): boolean {
  return hasErrorCode(error, "EEXIST");
}

function isNotFoundError(error: unknown): boolean {
  return hasErrorCode(error, "ENOENT");
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function handleToDisplayName(handle: string): string {
  return handle
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

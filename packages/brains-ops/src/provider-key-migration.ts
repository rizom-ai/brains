import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Decrypter, Encrypter, armor } from "age-encryption";
import { readLocalEnvValues } from "@brains/deploy-support";
import { parseYamlDocument } from "@brains/utils/yaml";
import { z } from "@brains/utils/zod";
import { isMap, isScalar, parseDocument, type Document } from "yaml";
import { readAgeIdentity } from "./secrets-encrypt";

/**
 * Offline migration of a pilot repo from the legacy single AI key to the
 * OpenAI key the fleet's canonical models run on. Active desired-state
 * loading never calls it.
 */

/** The legacy shared selector, and the variable the brain now reads. */
const LEGACY_SHARED_SELECTOR = "AI_API_KEY";
const OPENAI_SELECTOR = "OPENAI_API_KEY";

/** Legacy field → its OpenAI field, in desired state and encrypted secrets. */
const FIELD_RENAMES: Readonly<Record<string, string>> = {
  aiApiKey: "openaiApiKey",
  aiApiKeyOverride: "openaiApiKeyOverride",
};

/**
 * Rename a desired-state file's legacy AI key fields in place, keeping their
 * position and comments. The shared selector follows the variable rename;
 * an override keeps the operator secret it names.
 */
export function migrateProviderKeyFieldsYaml(input: string): string {
  const document = parseDocument(input, { keepSourceTokens: true });
  return renameProviderKeyFields(document)
    ? document.toString({ lineWidth: 0 })
    : input;
}

/** The legacy AI key fields of a desired-state document, renamed in place. */
export function renameProviderKeyFields(document: Document): boolean {
  if (!isMap(document.contents)) return false;
  const renamed = document.contents.items.filter((pair) => {
    if (!isScalar(pair.key) || typeof pair.key.value !== "string") {
      return false;
    }
    const target = FIELD_RENAMES[pair.key.value];
    if (!target) return false;
    if (
      pair.key.value === "aiApiKey" &&
      isScalar(pair.value) &&
      pair.value.value === LEGACY_SHARED_SELECTOR
    ) {
      pair.value.value = OPENAI_SELECTOR;
    }
    pair.key.value = target;
    return true;
  });
  return renamed.length > 0;
}

/** The OpenAI selector for a legacy shared AI key selector. */
export function openaiSelectorFor(legacySelector: string): string {
  return legacySelector === LEGACY_SHARED_SELECTOR
    ? OPENAI_SELECTOR
    : legacySelector;
}

/** Pass the OpenAI key to the container where the deploy passed the legacy key. */
export function migratePilotDeploySecrets(input: string): string {
  return input.replace(
    new RegExp(`^(\\s+- )${LEGACY_SHARED_SELECTOR}$`, "m"),
    `$1${OPENAI_SELECTOR}`,
  );
}

/** Rename the legacy shared key's variable, keeping where its value comes from. */
export function migratePilotEnvSchema(input: string): string {
  return input.replace(
    new RegExp(`^${LEGACY_SHARED_SELECTOR}=`, "m"),
    `${OPENAI_SELECTOR}=`,
  );
}

const overrideSchema = z.looseObject({
  aiApiKeyOverride: z.string().optional(),
});
const cohortMembersSchema = z.looseObject({
  members: z.array(z.string()).default([]),
  aiApiKeyOverride: z.string().optional(),
});
const agePublicKeySchema = z.looseObject({ agePublicKey: z.string() });

async function listYaml(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries.filter((name) => name.endsWith(".yaml")).sort();
  } catch {
    // A pilot without cohorts or users has nothing to migrate there.
    return [];
  }
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    // An absent file is one the pilot does not have.
    return undefined;
  }
}

/** Handles whose encrypted secrets can hold the legacy key: those overriding it. */
async function overridingHandles(rootDir: string): Promise<string[]> {
  const cohortFiles = await listYaml(join(rootDir, "cohorts"));
  const cohortMembers = await Promise.all(
    cohortFiles.map(async (name) => {
      const parsed = parseYamlDocument(
        await readFile(join(rootDir, "cohorts", name), "utf8"),
        cohortMembersSchema,
      );
      return parsed.ok && parsed.data.aiApiKeyOverride
        ? parsed.data.members
        : [];
    }),
  );
  const userFiles = (await listYaml(join(rootDir, "users"))).filter(
    (name) => !name.endsWith(".secrets.yaml"),
  );
  const overridingUsers = await Promise.all(
    userFiles.map(async (name) => {
      const parsed = parseYamlDocument(
        await readFile(join(rootDir, "users", name), "utf8"),
        overrideSchema,
      );
      return parsed.ok && parsed.data.aiApiKeyOverride
        ? [name.replace(/\.yaml$/, "")]
        : [];
    }),
  );
  return [...new Set([...cohortMembers.flat(), ...overridingUsers.flat()])];
}

/** Re-encrypt one overriding user's secrets with the OpenAI field name. */
async function migrateEncryptedSecrets(
  rootDir: string,
  handle: string,
  identity: string | undefined,
  recipient: string,
): Promise<boolean> {
  const path = join(rootDir, "users", `${handle}.secrets.yaml.age`);
  const armored = await readOptional(path);
  if (armored === undefined) return false;
  if (!identity) {
    throw new Error(
      `users/${handle}.secrets.yaml.age may hold the legacy AI key; set AGE_SECRET_KEY or AGE_SECRET_KEY_FILE to migrate it`,
    );
  }
  const decrypter = new Decrypter();
  decrypter.addIdentity(identity);
  const plaintext = await decrypter.decrypt(armor.decode(armored), "text");
  const migrated = migrateProviderKeyFieldsYaml(plaintext);
  if (migrated === plaintext) return false;
  const encrypter = new Encrypter();
  encrypter.addRecipient(recipient);
  await writeFile(path, armor.encode(await encrypter.encrypt(migrated)));
  return true;
}

/**
 * Migrate a pilot checkout in place; returns the files it changed. Running
 * it again changes nothing.
 */
export async function migratePilotRepoProviderKeys(
  rootDir: string,
  env: NodeJS.ProcessEnv,
): Promise<string[]> {
  const desiredState = [
    "pilot.yaml",
    ...(await listYaml(join(rootDir, "cohorts"))).map(
      (name) => `cohorts/${name}`,
    ),
    ...(await listYaml(join(rootDir, "users")))
      .filter((name) => !name.endsWith(".secrets.yaml"))
      .map((name) => `users/${name}`),
  ];
  // Overrides are read before the desired state is rewritten.
  const handles = await overridingHandles(rootDir);

  const rewrites = await Promise.all(
    [
      ...desiredState.map((file) => ({
        file,
        migrate: migrateProviderKeyFieldsYaml,
      })),
      { file: ".env.schema", migrate: migratePilotEnvSchema },
      { file: "deploy/kamal/deploy.yml", migrate: migratePilotDeploySecrets },
    ].map(async ({ file, migrate }) => {
      const path = join(rootDir, file);
      const input = await readOptional(path);
      if (input === undefined) return [];
      const output = migrate(input);
      if (output === input) return [];
      await writeFile(path, output);
      return [file];
    }),
  );

  const pilot = parseYamlDocument(
    (await readOptional(join(rootDir, "pilot.yaml"))) ?? "",
    agePublicKeySchema,
  );
  const identity = readAgeIdentity(rootDir, env, readLocalEnvValues(rootDir));
  const secrets =
    handles.length === 0
      ? []
      : await Promise.all(
          handles.map(async (handle) => {
            if (!pilot.ok) {
              throw new Error(
                "pilot.yaml needs agePublicKey to re-encrypt secrets",
              );
            }
            return (await migrateEncryptedSecrets(
              rootDir,
              handle,
              identity,
              pilot.data.agePublicKey,
            ))
              ? [`users/${handle}.secrets.yaml.age`]
              : [];
          }),
        );

  return [...rewrites.flat(), ...secrets.flat()];
}

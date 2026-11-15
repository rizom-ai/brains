import { createTempDir } from "@brains/test-utils";
import { describe, expect, it } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  armor,
  Decrypter,
  Encrypter,
  generateIdentity,
  identityToRecipient,
} from "age-encryption";
import {
  migratePilotDeploySecrets,
  migratePilotEnvSchema,
  migratePilotRepoProviderKeys,
  migrateProviderKeyFieldsYaml,
} from "../src/provider-key-migration";
import { cohortSchema, pilotSchema } from "../src/schema";
import { parseYamlDocument } from "@brains/utils/yaml";

const pilotYaml = `brainVersion: 0.2.0-alpha.1
bundleContract: capability-bundles-v1
bundles:
  - core
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
# The shared key every brain uses
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
agePublicKey: age1qqqq
`;

describe("provider key migration of desired state", () => {
  it("renames the shared AI key to the OpenAI key in place", () => {
    const migrated = migrateProviderKeyFieldsYaml(pilotYaml);

    expect(migrated).toContain(
      "# The shared key every brain uses\nopenaiApiKey: OPENAI_API_KEY\ngitSyncToken",
    );
    expect(migrated).not.toMatch(/^aiApiKey:/m);
    const parsed = parseYamlDocument(migrated, pilotSchema);
    expect(parsed.ok).toBe(true);
  });

  it("keeps an override's selector under the OpenAI key", () => {
    const migrated = migrateProviderKeyFieldsYaml(
      "members:\n  - becca\naiApiKeyOverride: COHORT_AI_KEY\n",
    );

    expect(migrated).toBe(
      "members:\n  - becca\nopenaiApiKeyOverride: COHORT_AI_KEY\n",
    );
    expect(parseYamlDocument(migrated, cohortSchema).ok).toBe(true);
  });

  it("leaves migrated desired state unchanged", () => {
    const once = migrateProviderKeyFieldsYaml(pilotYaml);
    expect(migrateProviderKeyFieldsYaml(once)).toBe(once);
  });
});

describe("provider key migration of the deploy config", () => {
  it("passes the OpenAI key to the container in place of the legacy key", () => {
    expect(
      migratePilotDeploySecrets(
        "env:\n  secret:\n    - AI_API_KEY\n    - GIT_SYNC_TOKEN\n",
      ),
    ).toBe("env:\n  secret:\n    - OPENAI_API_KEY\n    - GIT_SYNC_TOKEN\n");
  });
});

describe("provider key migration of the env schema", () => {
  it("renames the shared key's variable and keeps its source", () => {
    const migrated = migratePilotEnvSchema(
      `# AI provider\n# @required @sensitive\nAI_API_KEY=bitwarden("secret-id")\n\nGIT_SYNC_TOKEN=\n`,
    );

    expect(migrated).toBe(
      `# AI provider\n# @required @sensitive\nOPENAI_API_KEY=bitwarden("secret-id")\n\nGIT_SYNC_TOKEN=\n`,
    );
  });

  it("leaves an env schema without the shared key unchanged", () => {
    const input = "OPENAI_API_KEY=\nGIT_SYNC_TOKEN=\n";
    expect(migratePilotEnvSchema(input)).toBe(input);
  });
});

async function encryptFor(
  recipient: string,
  plaintext: string,
): Promise<string> {
  const encrypter = new Encrypter();
  encrypter.addRecipient(recipient);
  return armor.encode(await encrypter.encrypt(plaintext));
}

async function decryptWith(identity: string, armored: string): Promise<string> {
  const decrypter = new Decrypter();
  decrypter.addIdentity(identity);
  return decrypter.decrypt(armor.decode(armored), "text");
}

describe("provider key migration of a pilot repo", () => {
  it("rewrites desired state, the env schema and encrypted user secrets", async () => {
    const identity = await generateIdentity();
    const recipient = await identityToRecipient(identity);
    const root = await createTempDir("provider-key-migration-");
    await mkdir(join(root, "cohorts"), { recursive: true });
    await mkdir(join(root, "users"), { recursive: true });
    await writeFile(
      join(root, "pilot.yaml"),
      pilotYaml.replace("age1qqqq", recipient),
    );
    await writeFile(
      join(root, "cohorts", "alpha.yaml"),
      "members:\n  - becca\n",
    );
    await writeFile(
      join(root, "users", "becca.yaml"),
      "handle: becca\ndiscord:\n  enabled: false\naiApiKeyOverride: BECCA_AI_KEY\n",
    );
    await writeFile(
      join(root, ".env.schema"),
      `# @required @sensitive\nAI_API_KEY=bitwarden("secret-id")\n`,
    );
    await writeFile(
      join(root, "users", "becca.secrets.yaml.age"),
      await encryptFor(
        recipient,
        "gitSyncToken: ghp_test\naiApiKey: sk-proj-becca\n",
      ),
    );

    const changed = await migratePilotRepoProviderKeys(root, {
      AGE_SECRET_KEY: identity,
    });

    expect(changed.sort()).toEqual([
      ".env.schema",
      "pilot.yaml",
      "users/becca.secrets.yaml.age",
      "users/becca.yaml",
    ]);
    expect(await readFile(join(root, "users", "becca.yaml"), "utf8")).toContain(
      "openaiApiKeyOverride: BECCA_AI_KEY",
    );
    expect(await readFile(join(root, ".env.schema"), "utf8")).toContain(
      'OPENAI_API_KEY=bitwarden("secret-id")',
    );
    const secrets = await decryptWith(
      identity,
      await readFile(join(root, "users", "becca.secrets.yaml.age"), "utf8"),
    );
    expect(secrets).toContain("openaiApiKey: sk-proj-becca");
    expect(secrets).toContain("gitSyncToken: ghp_test");
    expect(secrets).not.toMatch(/^aiApiKey:/m);

    expect(
      await migratePilotRepoProviderKeys(root, { AGE_SECRET_KEY: identity }),
    ).toEqual([]);
  });

  it("needs no age identity when no user overrides the shared key", async () => {
    const identity = await generateIdentity();
    const root = await createTempDir("provider-key-migration-");
    await mkdir(join(root, "users"), { recursive: true });
    await writeFile(
      join(root, "pilot.yaml"),
      pilotYaml.replace("age1qqqq", await identityToRecipient(identity)),
    );
    await writeFile(
      join(root, "users", "becca.yaml"),
      "handle: becca\ndiscord:\n  enabled: false\n",
    );
    await writeFile(
      join(root, "users", "becca.secrets.yaml.age"),
      await encryptFor(
        await identityToRecipient(identity),
        "gitSyncToken: ghp_test\n",
      ),
    );

    expect(await migratePilotRepoProviderKeys(root, {})).toEqual([
      "pilot.yaml",
    ]);
  });

  it("refuses to rewrite an overriding user's secrets it cannot decrypt", async () => {
    const identity = await generateIdentity();
    const root = await createTempDir("provider-key-migration-");
    await mkdir(join(root, "users"), { recursive: true });
    await writeFile(
      join(root, "users", "becca.yaml"),
      "handle: becca\ndiscord:\n  enabled: false\naiApiKeyOverride: BECCA_AI_KEY\n",
    );
    await writeFile(
      join(root, "pilot.yaml"),
      pilotYaml.replace("age1qqqq", await identityToRecipient(identity)),
    );
    await writeFile(
      join(root, "users", "becca.secrets.yaml.age"),
      await encryptFor(
        await identityToRecipient(identity),
        "aiApiKey: sk-proj-becca\n",
      ),
    );

    let failure: unknown;
    try {
      await migratePilotRepoProviderKeys(root, {});
    } catch (error) {
      failure = error;
    }
    expect(String(failure)).toContain("AGE_SECRET_KEY");
  });
});

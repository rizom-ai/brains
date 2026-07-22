import { describe, expect, it } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  Encrypter,
  armor,
  generateIdentity,
  identityToRecipient,
} from "age-encryption";

import { initPilotRepo } from "../src/init";
import { encryptPilotSecrets } from "../src/secrets-encrypt";

const opsPackageDir = dirname(import.meta.dir);

async function linkPilotDependencies(repoDir: string): Promise<void> {
  const opsTarget = join(repoDir, "node_modules", "@rizom", "ops");
  await mkdir(dirname(opsTarget), { recursive: true });
  await symlink(opsPackageDir, opsTarget, "dir");

  const ageTarget = join(repoDir, "node_modules", "age-encryption");
  await mkdir(ageTarget, { recursive: true });
  await Promise.all([
    writeFile(
      join(ageTarget, "package.json"),
      '{"name":"age-encryption","type":"module","exports":"./index.js"}\n',
    ),
    writeFile(
      join(ageTarget, "index.js"),
      `export * from ${JSON.stringify(import.meta.resolve("age-encryption"))};\n`,
    ),
  ]);
}

function parseGitHubOutput(content: string): Record<string, string> {
  return Object.fromEntries(
    content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

async function encryptForRecipient(
  plaintext: string,
  recipient: string,
): Promise<string> {
  const encrypter = new Encrypter();
  encrypter.addRecipient(recipient);
  return armor.encode(await encrypter.encrypt(plaintext));
}

describe("rover-pilot custom-domain deploy scripts", () => {
  it("resolves fleet and custom domain aliases without confusing matching handles", async () => {
    const root = await mkdtemp(join(tmpdir(), "brains-ops-domains-"));
    const repo = join(root, "rover-pilot");
    const outputPath = join(root, "github-output.txt");

    await initPilotRepo(repo);
    await linkPilotDependencies(repo);
    await mkdir(join(repo, "users", "alice"), { recursive: true });
    await writeFile(
      join(repo, "users", "alice", ".env"),
      "BRAIN_VERSION=0.1.1-alpha.14\nCONTENT_REPO=example/content\n",
    );

    const cases = [
      {
        label: "fleet domain",
        domain: "alice.rizom.ai",
        expectedPreview: "alice-preview.rizom.ai",
        expectedWww: "",
        expectedZoneId: "shared-zone",
      },
      {
        label: "pilot-zone apex",
        domain: "rizom.ai",
        expectedPreview: "preview.rizom.ai",
        expectedWww: "www.rizom.ai",
        expectedZoneId: "alice-zone",
      },
      {
        label: "another direct pilot-zone site",
        domain: "project.rizom.ai",
        expectedPreview: "project-preview.rizom.ai",
        expectedWww: "www.project.rizom.ai",
        expectedZoneId: "alice-zone",
      },
      {
        label: "foreign domain",
        domain: "yeehaa.io",
        expectedPreview: "preview.yeehaa.io",
        expectedWww: "www.yeehaa.io",
        expectedZoneId: "alice-zone",
      },
      {
        label: "custom apex beginning with the user handle",
        domain: "alice.io",
        expectedPreview: "preview.alice.io",
        expectedWww: "www.alice.io",
        expectedZoneId: "alice-zone",
      },
    ] as const;

    for (const testCase of cases) {
      await writeFile(
        join(repo, "users", "alice.yaml"),
        [
          "handle: alice",
          ...(testCase.domain === "alice.rizom.ai"
            ? []
            : [`domainOverride: ${testCase.domain}`]),
          ...(testCase.expectedZoneId === "shared-zone"
            ? []
            : ["cloudflareZoneId: alice-zone"]),
          "discord:",
          "  enabled: false",
          "",
        ].join("\n"),
      );
      await writeFile(
        join(repo, "users", "alice", "brain.yaml"),
        `brain: rover\ndomain: ${testCase.domain}\npreset: core\n`,
      );
      await writeFile(outputPath, "");

      execFileSync(
        process.execPath,
        ["deploy/scripts/resolve-user-config.ts"],
        {
          cwd: repo,
          env: {
            ...process.env,
            HANDLE: "alice",
            GITHUB_REPOSITORY: "rizom-ai/rover-pilot",
            GITHUB_OUTPUT: outputPath,
            CF_ZONE_ID: "shared-zone",
          },
          encoding: "utf8",
        },
      );

      const output = parseGitHubOutput(await readFile(outputPath, "utf8"));
      expect(output["preview_domain"], testCase.label).toBe(
        testCase.expectedPreview,
      );
      expect(output["www_domain"], testCase.label).toBe(testCase.expectedWww);
      expect(output["cloudflare_zone_id"], testCase.label).toBe(
        testCase.expectedZoneId,
      );
    }
  });

  it("round-trips real PEM files and leaves shared TLS env untouched when absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "brains-ops-tls-decrypt-"));
    const repo = join(root, "rover-pilot");
    const envPath = join(root, "github-env.txt");
    const outputPath = join(root, "github-output.txt");
    const certificatePath = join(root, "origin.pem");
    const privateKeyPath = join(root, "origin.key");
    const certificatePem = `-----BEGIN CERTIFICATE-----\n${"A".repeat(256)}\n-----END CERTIFICATE-----\n`;
    const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${"B".repeat(256)}\n-----END PRIVATE KEY-----\n`;
    const identity = await generateIdentity();
    const recipient = await identityToRecipient(identity);

    await initPilotRepo(repo);
    await linkPilotDependencies(repo);
    await writeFile(
      join(repo, "pilot.yaml"),
      (await readFile(join(repo, "pilot.yaml"), "utf8")).replace(
        /^agePublicKey: .*$/m,
        `agePublicKey: ${recipient}`,
      ),
    );
    await writeFile(
      join(repo, "users", "alice.yaml"),
      "handle: alice\ndiscord:\n  enabled: false\n",
    );
    await Promise.all([
      writeFile(certificatePath, certificatePem),
      writeFile(privateKeyPath, privateKeyPem),
    ]);

    const runDecrypt = async (): Promise<string> => {
      await Promise.all([writeFile(envPath, ""), writeFile(outputPath, "")]);

      const result = spawnSync(
        process.execPath,
        ["deploy/scripts/decrypt-user-secrets.ts", "alice"],
        {
          cwd: repo,
          env: {
            ...process.env,
            AGE_SECRET_KEY: identity,
            GITHUB_ENV: envPath,
            GITHUB_OUTPUT: outputPath,
            CERTIFICATE_PEM: "shared-certificate",
            PRIVATE_KEY_PEM: "shared-private-key",
          },
          encoding: "utf8",
        },
      );
      if (result.status !== 0) {
        throw new Error(result.stderr);
      }

      return readFile(envPath, "utf8");
    };

    await encryptPilotSecrets(repo, "alice", {
      env: {
        CERTIFICATE_PEM_FILE: certificatePath,
        PRIVATE_KEY_PEM_FILE: privateKeyPath,
      },
      logger: () => {},
    });
    const customTlsEnv = await runDecrypt();

    expect(customTlsEnv).toContain("CERTIFICATE_PEM<<EOF_CERTIFICATE_PEM_");
    expect(customTlsEnv).toContain(certificatePem.trim());
    expect(customTlsEnv).toContain("PRIVATE_KEY_PEM<<EOF_PRIVATE_KEY_PEM_");
    expect(customTlsEnv).toContain(privateKeyPem.trim());

    await writeFile(
      join(repo, "users", "alice.secrets.yaml.age"),
      await encryptForRecipient(
        "atprotoAppPassword: app-password\n",
        recipient,
      ),
    );
    const sharedTlsEnv = await runDecrypt();

    expect(sharedTlsEnv).toContain("ATPROTO_APP_PASSWORD=app-password");
    expect(sharedTlsEnv).not.toContain("CERTIFICATE_PEM");
    expect(sharedTlsEnv).not.toContain("PRIVATE_KEY_PEM");

    await writeFile(
      join(repo, "users", "alice.secrets.yaml.age"),
      await encryptForRecipient(
        'certificatePem: "custom-certificate"\n',
        recipient,
      ),
    );
    let partialPairError: unknown;
    try {
      await runDecrypt();
    } catch (error) {
      partialPairError = error;
    }
    expect(partialPairError).toBeInstanceOf(Error);
    if (!(partialPairError instanceof Error)) {
      throw new Error("Expected partial TLS pair validation to fail");
    }
    expect(partialPairError.message).toContain(
      "Custom-domain TLS secrets require both certificatePem and privateKeyPem",
    );
  });
});

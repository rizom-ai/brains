import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fromYaml } from "@brains/utils/yaml";
import packageJson from "../package.json";

const repositoryRoot = join(import.meta.dir, "..", "..", "..");
const testAppDirectory = join(
  import.meta.dir,
  "..",
  "test-apps",
  "unified-inbox",
);
const TEST_APP_CONFIG = "packages/brain-cli/test-apps/unified-inbox/brain.yaml";

/**
 * The configuration as it would be committed, not as it sits on disk.
 *
 * The committed posture names the dedicated synthetic-mail provider while all
 * credentials remain environment references. Reading the staged content checks
 * exactly what will land in the repository, including its site/publishing
 * composition, without consulting a developer's ignored environment files.
 */
function stagedFile(path: string): string {
  const shown = Bun.spawnSync(["git", "show", `:${path}`], {
    cwd: repositoryRoot,
  });
  if (!shown.success) {
    throw new Error(
      `Expected ${path} to be tracked by git: ${shown.stderr.toString().trim()}`,
    );
  }
  return shown.stdout.toString();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a record");
  }
  return value as Record<string, unknown>;
}

describe("canonical unified inbox test app", () => {
  test("keeps email workflows and unified inbox opt-in with explicit IMAP settings", () => {
    const yaml = stagedFile(TEST_APP_CONFIG);
    const config = asRecord(fromYaml<unknown>(yaml));
    const plugins = asRecord(config["plugins"]);
    const site = asRecord(config["site"]);
    const email = asRecord(plugins["email"]);
    const imap = asRecord(email["imap"]);
    const notifications = asRecord(plugins["notifications"]);
    const defaultRecipient = asRecord(notifications["defaultRecipient"]);

    expect(config["bundles"]).toEqual(["core", "site", "publishing"]);
    expect(config["add"]).toEqual(["email-workflows", "unified-inbox"]);
    expect(site).toEqual({
      package: "@brains/site-professional",
      theme: "@rizom/theme-default",
    });
    expect(imap).toMatchObject({
      host: "imap.migadu.com",
      port: 993,
      user: "${IMAP_USER}",
      password: "${IMAP_PASSWORD}",
      mailbox: "INBOX",
      pollMode: "interval",
      pollIntervalMs: 5_000,
    });
    expect(email).toMatchObject({
      apiKey: "${SETUP_EMAIL_API_KEY}",
      from: "${SETUP_EMAIL_FROM}",
    });
    expect(defaultRecipient).toEqual({
      type: "email",
      address: "${SETUP_EMAIL_TO}",
    });
    expect(yaml).not.toContain("${IMAP_HOST}");
    expect(yaml).not.toContain("${IMAP_PORT}");
  });

  test("documents synthetic-only secrets without committing values", () => {
    const environment = readFileSync(
      join(testAppDirectory, ".env.example"),
      "utf8",
    );
    const readme = readFileSync(join(testAppDirectory, "README.md"), "utf8");

    expect(
      environment.split("\n").filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line)),
    ).toEqual([
      "AI_API_KEY=",
      "IMAP_USER=",
      "IMAP_PASSWORD=",
      "SETUP_EMAIL_API_KEY=",
      "SETUP_EMAIL_FROM=",
      "SETUP_EMAIL_TO=",
    ]);
    expect(readme).toContain("synthetic messages only");
    expect(readme).toContain("bun start:unified-inbox");
  });

  test("provides a canonical start posture", () => {
    expect(packageJson.scripts["start:unified-inbox"]).toContain(
      "test-apps/unified-inbox",
    );
  });
});

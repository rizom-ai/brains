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
 * Pointing this checkout at a real mailbox is how the inbox gets exercised
 * end to end, so the working copy is a scratch surface by design. What has to
 * stay true is what lands in the repository: an unresolvable host, and no live
 * mail server carried in with it. Reading the staged content asserts exactly
 * that, and stops a local live-mail run from failing a suite it has nothing to
 * do with.
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
    const email = asRecord(plugins["email"]);
    const imap = asRecord(email["imap"]);
    const notifications = asRecord(plugins["notifications"]);
    const defaultRecipient = asRecord(notifications["defaultRecipient"]);

    expect(config["bundles"]).toEqual(["core"]);
    expect(config["add"]).toEqual(["email-workflows", "unified-inbox"]);
    expect(imap).toMatchObject({
      host: "imap.test.invalid",
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

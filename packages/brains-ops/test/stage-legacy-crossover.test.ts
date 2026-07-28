import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stageLegacyCrossover } from "../src/stage-legacy-crossover";

describe("stageLegacyCrossover", () => {
  test("creates a complete canonical review copy without touching the source", async () => {
    const root = await mkdtemp(join(tmpdir(), "ops-crossover-stage-"));
    const source = join(root, "source");
    const output = join(root, "output");
    await mkdir(join(source, "cohorts"), { recursive: true });
    await mkdir(join(source, "users"), { recursive: true });
    await mkdir(join(source, ".brains-ops", "age"), { recursive: true });
    await mkdir(join(source, "dist"), { recursive: true });
    const legacyPilot = `schemaVersion: 1
brainVersion: 0.2.0-alpha.231
model: rover
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
preset: default
aiApiKey: PILOT_AI_API_KEY
gitSyncToken: PILOT_GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
agePublicKey: age1pilotpublickey
`;
    await writeFile(join(source, "pilot.yaml"), legacyPilot);
    await writeFile(join(source, ".env"), "SECRET=value\n");
    await writeFile(
      join(source, ".brains-ops", "age", "identity.txt"),
      "AGE-SECRET-KEY-test\n",
    );
    await writeFile(
      join(source, "users", "alice.secrets.yaml"),
      "discordBotToken: secret\n",
    );
    await writeFile(join(source, "dist", "bundle.js"), "build artifact\n");
    await writeFile(
      join(source, "cohorts", "canary.yaml"),
      "members:\n  - alice\npresetOverride: core\n",
    );
    await writeFile(
      join(source, "users", "alice.yaml"),
      "handle: alice\ndiscord:\n  enabled: false\n",
    );

    const staged = await stageLegacyCrossover(source, output);

    expect(await readFile(join(source, "pilot.yaml"), "utf8")).toBe(
      legacyPilot,
    );
    expect(await readFile(join(output, "pilot.yaml"), "utf8")).toContain(
      "schemaVersion: 2",
    );
    const stagedBrain = await readFile(
      join(output, "users", "alice", "brain.yaml"),
      "utf8",
    );
    expect(stagedBrain).toContain("brain: brain");
    expect(stagedBrain).toContain("bundles:\n  - core");
    expect(await Bun.file(join(output, ".env")).exists()).toBe(false);
    expect(await Bun.file(join(output, ".brains-ops")).exists()).toBe(false);
    expect(await Bun.file(join(output, "dist")).exists()).toBe(false);
    expect(
      await Bun.file(join(output, "users", "alice.secrets.yaml")).exists(),
    ).toBe(false);
    expect(
      await Bun.file(join(output, "users", "alice", ".env")).exists(),
    ).toBe(true);
    expect(staged.changedFiles).toEqual(
      expect.arrayContaining([
        "pilot.yaml",
        "cohorts/canary.yaml",
        "users/alice/brain.yaml",
        "views/users.md",
      ]),
    );
  });

  test("refuses to write inside the source repository", async () => {
    const source = await mkdtemp(join(tmpdir(), "ops-crossover-source-"));
    let failure: unknown;
    try {
      await stageLegacyCrossover(source, join(source, "staged"));
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    if (failure instanceof Error) {
      expect(failure.message).toContain("outside the source repository");
    }
  });
});

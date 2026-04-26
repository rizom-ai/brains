import { describe, expect, it } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { addPilotUser } from "../src/user-add";

async function createPilotRepo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "brains-ops-user-add-"));

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(root, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }

  return root;
}

describe("addPilotUser", () => {
  it("creates a user file, plaintext secrets template, and cohort membership", async () => {
    const root = await createPilotRepo({
      "cohorts/cohort-1.yaml": `members:
  - alice
`,
    });

    const result = await addPilotUser(root, "bob", { cohort: "cohort-1" });

    expect(result.createdUser).toBe(true);
    expect(result.createdSecretsTemplate).toBe(true);
    expect(result.addedToCohort).toBe(true);
    expect(await readFile(join(root, "users", "bob.yaml"), "utf8")).toBe(
      `handle: bob
anchorProfile:
  name: Bob
discord:
  enabled: true
`,
    );
    expect(
      await readFile(join(root, "users", "bob.secrets.yaml"), "utf8"),
    ).toBe(
      `# local per-user secret staging file
# fill values, run \`bunx brains-ops secrets:encrypt . bob\`, then the plaintext file will be removed
discordBotToken: 
`,
    );
    expect(await readFile(join(root, "cohorts", "cohort-1.yaml"), "utf8"))
      .toBe(`members:
  - alice
  - bob
`);
  });

  it("can include a Discord anchor user id", async () => {
    const root = await createPilotRepo({
      "cohorts/cohort-1.yaml": `members:
  - alice
`,
    });

    await addPilotUser(root, "bob", {
      cohort: "cohort-1",
      anchorId: "1234567890",
    });

    expect(await readFile(join(root, "users", "bob.yaml"), "utf8")).toBe(
      `handle: bob
anchorProfile:
  name: Bob
discord:
  enabled: true
  anchorUserId: "1234567890"
`,
    );
  });

  it("is replay-safe for existing user and cohort membership", async () => {
    const root = await createPilotRepo({
      "users/bob.yaml": `handle: bob
discord:
  enabled: true
`,
      "users/bob.secrets.yaml": `discordBotToken: existing
`,
      "cohorts/cohort-1.yaml": `members:
  - bob
`,
    });

    const result = await addPilotUser(root, "bob", { cohort: "cohort-1" });

    expect(result.createdUser).toBe(false);
    expect(result.createdSecretsTemplate).toBe(false);
    expect(result.addedToCohort).toBe(false);
    expect(await readFile(join(root, "users", "bob.yaml"), "utf8")).toBe(
      `handle: bob
discord:
  enabled: true
`,
    );
    expect(await readFile(join(root, "cohorts", "cohort-1.yaml"), "utf8"))
      .toBe(`members:
  - bob
`);
  });

  it("creates the cohort file when it does not exist", async () => {
    const root = await createPilotRepo({});

    await addPilotUser(root, "bob", { cohort: "cohort-1" });

    expect(await readFile(join(root, "cohorts", "cohort-1.yaml"), "utf8"))
      .toBe(`members:
  - bob
`);
  });
});

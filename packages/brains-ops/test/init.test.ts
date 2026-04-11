import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { initPilotRepo } from "../src/init";

describe("initPilotRepo", () => {
  it("creates the private rover-pilot repo skeleton", async () => {
    const root = await mkdtemp(join(tmpdir(), "brains-ops-init-"));
    const repo = join(root, "rover-pilot");

    await initPilotRepo(repo);

    expect(existsSync(join(repo, "pilot.yaml"))).toBe(true);
    expect(existsSync(join(repo, "cohorts"))).toBe(true);
    expect(existsSync(join(repo, "users"))).toBe(true);
    expect(existsSync(join(repo, "views", "users.md"))).toBe(true);
    expect(existsSync(join(repo, "docs", "onboarding-checklist.md"))).toBe(
      true,
    );
    expect(existsSync(join(repo, "docs", "operator-playbook.md"))).toBe(true);
    expect(existsSync(join(repo, "README.md"))).toBe(true);

    const pilotYaml = await readFile(join(repo, "pilot.yaml"), "utf8");
    expect(pilotYaml).toContain("schemaVersion: 1");
    expect(pilotYaml).toContain("model: rover");
    expect(pilotYaml).toContain("githubOrg: <github-org>");

    const readme = await readFile(join(repo, "README.md"), "utf8");
    expect(readme).toContain("brains-ops init");
    expect(readme).toContain("brains-ops render");
  });

  it("preserves existing human-edited files on rerun", async () => {
    const root = await mkdtemp(join(tmpdir(), "brains-ops-init-"));
    const repo = join(root, "rover-pilot");

    await mkdir(repo, { recursive: true });
    await writeFile(
      join(repo, "pilot.yaml"),
      "schemaVersion: 1\nbrainVersion: 0.1.1-alpha.99\nmodel: rover\ngithubOrg: custom-org\nrepoPrefix: rover-\ncontentRepoSuffix: -content\ndomainSuffix: .rover.example.com\npreset: core\n",
    );

    await initPilotRepo(repo);

    const pilotYaml = await readFile(join(repo, "pilot.yaml"), "utf8");
    expect(pilotYaml).toContain("githubOrg: custom-org");
    expect(pilotYaml).not.toContain("<github-org>");
    expect(existsSync(join(repo, "views", "users.md"))).toBe(true);
  });
});

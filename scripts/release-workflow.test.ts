import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repositoryRoot = join(import.meta.dir, "..");

function releasePublishStep(): string {
  const workflow = readFileSync(
    join(repositoryRoot, ".github/workflows/release.yml"),
    "utf8",
  );
  const publishStep = workflow.match(
    / {6}- name: Publish to npm\n[\s\S]*?(?=\n {6}- name:|$)/,
  );

  if (!publishStep) {
    throw new Error("Release workflow is missing its npm publish step");
  }

  return publishStep[0];
}

describe("core release workflow", () => {
  test("publishes through GitHub OIDC without a registry token", () => {
    const workflow = readFileSync(
      join(repositoryRoot, ".github/workflows/release.yml"),
      "utf8",
    );
    const publishStep = releasePublishStep();

    expect(workflow).toContain("id-token: write");
    expect(publishStep).toContain("bun run changeset:publish:core");
    expect(publishStep).not.toContain("NPM_TOKEN");
    expect(publishStep).not.toContain("_authToken");
  });
});

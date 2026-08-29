import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repositoryRoot = join(import.meta.dir, "..");

function readWorkflow(fileName: string): string {
  return readFileSync(
    join(repositoryRoot, ".github/workflows", fileName),
    "utf8",
  );
}

function workflowStep(fileName: string, name: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const step = readWorkflow(fileName).match(
    new RegExp(
      ` {6}- name: ${escapedName}\\n[\\s\\S]*?(?=\\n {6}- name:|$)`,
      "u",
    ),
  );

  if (!step) {
    throw new Error(`${fileName} is missing its ${name} step`);
  }

  return step[0];
}

describe("core release workflow", () => {
  test("publishes through GitHub OIDC without a registry token", () => {
    const workflow = readWorkflow("release.yml");
    const publishStep = workflowStep("release.yml", "Publish to npm");

    expect(workflow).toContain("id-token: write");
    expect(publishStep).toContain("bun run changeset:publish:core");
    expect(publishStep).not.toContain("NPM_TOKEN");
    expect(publishStep).not.toContain("_authToken");
  });

  test("publishes the stable site and proves its exact registry pairing before core", () => {
    const workflow = readWorkflow("release.yml");
    const versionIndex = workflow.indexOf(
      "- name: Version core packages or coordinated stable plan",
    );
    const siteIndex = workflow.indexOf(
      "- name: Coordinate stable site publication",
    );
    const evidenceIndex = workflow.indexOf(
      "- name: Run exact stable-site registry matrix",
    );
    const publishIndex = workflow.indexOf("- name: Publish to npm");

    expect(versionIndex).toBeGreaterThanOrEqual(0);
    expect(siteIndex).toBeGreaterThan(versionIndex);
    expect(evidenceIndex).toBeGreaterThan(siteIndex);
    expect(publishIndex).toBeGreaterThan(evidenceIndex);

    const siteStep = workflowStep(
      "release.yml",
      "Coordinate stable site publication",
    );
    expect(siteStep).toContain(
      "if: steps.release_mode.outputs.mode != 'standard'",
    );
    expect(siteStep).toContain("gh workflow run site-ci.yml --ref main");
    expect(siteStep).toContain('gh run watch "$site_ci_run" --exit-status');
    expect(siteStep).toContain(
      'gh run watch "$site_release_run" --exit-status',
    );
    expect(siteStep).toContain('npm view "@rizom/site@${expected_site}"');

    const evidenceStep = workflowStep(
      "release.yml",
      "Run exact stable-site registry matrix",
    );
    expect(evidenceStep).toContain('RIZOM_PUBLIC_API_REGISTRY_EVIDENCE: "1"');
    expect(evidenceStep).toContain(
      "RIZOM_PUBLIC_API_BRAIN_VERSION: ${{ steps.release_mode.outputs.brain_candidate_version }}",
    );
    expect(evidenceStep).toContain("public-authoring-registry-packed.test.ts");
    expect(workflow).not.toContain("Start stable site release checks");
  });
});

describe("site release workflow", () => {
  test("publishes through GitHub OIDC without a registry token", () => {
    const workflow = readWorkflow("site-release.yml");
    const publishStep = workflowStep(
      "site-release.yml",
      "Publish site and theme packages to npm",
    );

    expect(workflow).toContain("id-token: write");
    expect(publishStep).toContain("bun run changeset:publish:site");
    expect(publishStep).not.toContain("NPM_TOKEN");
    expect(publishStep).not.toContain("_authToken");
  });

  test("keeps standard versioning serialized while stable publication bypasses the core wait lock", () => {
    const workflow = readWorkflow("site-release.yml");

    expect(workflow).toContain("name: Classify Site Release");
    expect(workflow).toContain(
      "group: ${{ needs.classify.outputs.mode == 'stable-version' && 'npm-stable-site-release' || 'npm-release-main' }}",
    );
    expect(workflow).toContain(
      "if: ${{ needs.classify.outputs.mode != 'stable-exit' }}",
    );

    const versionStep = workflowStep(
      "site-release.yml",
      "Version site and theme packages",
    );
    expect(versionStep).toContain(
      "if: needs.classify.outputs.mode == 'standard'",
    );

    const prerequisiteStep = workflowStep(
      "site-release.yml",
      "Verify compatible core runtime is published",
    );
    expect(prerequisiteStep).toContain(
      "git show HEAD^:packages/brain-cli/package.json",
    );
    expect(prerequisiteStep).toContain("^0\\.2\\.0-alpha\\.[0-9]+$");
    expect(prerequisiteStep).toContain('npm view "@rizom/brain@${expected}"');

    expect(
      workflow.indexOf("- name: Publish site and theme packages to npm"),
    ).toBeGreaterThan(
      workflow.indexOf("- name: Verify compatible core runtime is published"),
    );
  });
});

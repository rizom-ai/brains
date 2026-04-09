import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const workflowPath = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  ".github",
  "workflows",
  "rizom-ai-deploy.yml",
);

const legacyWorkflowPath = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "apps",
  "rizom-ai",
  ".github",
  "workflows",
  "deploy.yml",
);

describe("rizom-ai deploy workflow", () => {
  it("lives at the repo root so GitHub Actions can discover it", () => {
    expect(existsSync(workflowPath)).toBe(true);
    expect(existsSync(legacyWorkflowPath)).toBe(false);
  });

  it("supports manual workflow_dispatch reruns", () => {
    const workflow = readFileSync(workflowPath, "utf-8");

    expect(workflow).toContain("workflow_dispatch:");
  });

  it("passes GitHub Actions secrets into varlock without OP_TOKEN", () => {
    const workflow = readFileSync(workflowPath, "utf-8");

    expect(workflow).toContain("varlock load");
    expect(workflow).toContain("name: Validate env via varlock");
    expect(workflow).toContain(
      "npx -y varlock load --path .env.schema --show-all",
    );
    expect(workflow).toContain(
      "npx -y varlock load --path .env.schema --format json --compact > /tmp/varlock-env.json",
    );
    expect(workflow).not.toContain("OP_TOKEN");
    expect(workflow).toContain("AI_API_KEY: ${{ secrets.AI_API_KEY }}");
    expect(workflow).toContain("GIT_SYNC_TOKEN: ${{ secrets.GIT_SYNC_TOKEN }}");
    expect(workflow).toContain("HCLOUD_TOKEN: ${{ secrets.HCLOUD_TOKEN }}");
    expect(workflow).toContain(
      "HCLOUD_SSH_KEY_NAME: ${{ secrets.HCLOUD_SSH_KEY_NAME }}",
    );
    expect(workflow).toContain(
      "KAMAL_SSH_PRIVATE_KEY: ${{ secrets.KAMAL_SSH_PRIVATE_KEY }}",
    );
    expect(workflow).toContain(
      "KAMAL_REGISTRY_PASSWORD: ${{ secrets.KAMAL_REGISTRY_PASSWORD }}",
    );
    expect(workflow).toContain("CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}");
    expect(workflow).toContain("CF_ZONE_ID: ${{ secrets.CF_ZONE_ID }}");
    expect(workflow).toContain(
      "CERTIFICATE_PEM: ${{ secrets.CERTIFICATE_PEM }}",
    );
    expect(workflow).toContain(
      "PRIVATE_KEY_PEM: ${{ secrets.PRIVATE_KEY_PEM }}",
    );
    expect(workflow).not.toContain("require('fs')");
    expect(workflow).toContain(
      'import { appendFileSync, readFileSync } from "node:fs";',
    );
    expect(workflow).toContain(
      'import { readFileSync, writeFileSync } from "node:fs";',
    );
    expect(workflow).toContain('import { appendFileSync } from "node:fs";');
    expect(workflow).not.toContain("location: 'nbg1'");
  });
});

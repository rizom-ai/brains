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
});

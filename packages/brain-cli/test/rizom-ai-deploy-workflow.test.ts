import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const workflowPath = join(
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
  it("supports manual workflow_dispatch reruns", () => {
    const workflow = readFileSync(workflowPath, "utf-8");

    expect(workflow).toContain("workflow_dispatch:");
  });
});

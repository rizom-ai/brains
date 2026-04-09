import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const workflowPath = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  ".github",
  "workflows",
  "publish-images.yml",
);

describe("publish-images workflow", () => {
  it("checks out and tags the exact triggering commit sha", () => {
    const workflow = readFileSync(workflowPath, "utf-8");

    expect(workflow).toContain(
      "ref: ${{ github.event.workflow_run.head_sha || github.sha }}",
    );
    expect(workflow).toContain(
      "type=raw,value=${{ github.event.workflow_run.head_sha || github.sha }}",
    );
  });

  it("adds the Kamal service label expected by deploys", () => {
    const workflow = readFileSync(workflowPath, "utf-8");

    expect(workflow).toContain("service=brain");
  });
});

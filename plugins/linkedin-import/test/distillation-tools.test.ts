import { describe, expect, it, mock } from "bun:test";
import type {
  IEntityService,
  ServicePluginContext,
  ToolContext,
  ToolResponse,
} from "@brains/plugins";
import { createTestEntity } from "@brains/test-utils";
import { profileContentDigest } from "../src/lib/profile-import-digest";
import { createLinkedInDistillationTools } from "../src/tools/distillation";

const toolContext: ToolContext = {
  interfaceType: "test",
  userId: "anchor",
};
const proposal = {
  tagline: "Designing resilient systems for meaningful work.",
  intro: "Ada helps teams turn complex systems into dependable products.",
  story:
    "Ada is a systems architect focused on resilient infrastructure.\n\nHer work connects technical depth with practical outcomes.",
};

function expectConfirmation(
  result: ToolResponse,
): Extract<ToolResponse, { needsConfirmation: true }> {
  expect(result).toHaveProperty("needsConfirmation", true);
  if (!("needsConfirmation" in result)) {
    throw new Error("Expected profile narrative confirmation");
  }
  return result;
}

function getArgs(
  confirmation: Extract<ToolResponse, { needsConfirmation: true }>,
): Record<string, unknown> {
  if (
    !confirmation.args ||
    typeof confirmation.args !== "object" ||
    Array.isArray(confirmation.args)
  ) {
    throw new Error("Expected object confirmation arguments");
  }
  return confirmation.args as Record<string, unknown>;
}

function createDeps(content?: string): {
  deps: Parameters<typeof createLinkedInDistillationTools>[1];
  enqueue: ReturnType<typeof mock>;
  generateObject: ReturnType<typeof mock>;
  profileContent: string;
} {
  const profileContent =
    content ??
    "---\nname: Ada Morgan\nheadline: Systems Architect\n---\nOriginal story.\n";
  const profile = createTestEntity("anchor-profile", {
    id: "anchor-profile",
    content: profileContent,
  });
  const enqueue = mock(async () => "distill-job-1");
  const generateObject = mock(async () => ({ object: proposal }));
  return {
    enqueue,
    generateObject,
    profileContent,
    deps: {
      ai: { generateObject } as unknown as Pick<
        ServicePluginContext["ai"],
        "generateObject"
      >,
      entityService: {
        getEntity: mock(async () => profile),
      } as unknown as IEntityService,
      jobs: { enqueue } as unknown as ServicePluginContext["jobs"],
    },
  };
}

describe("LinkedIn profile distillation tool", () => {
  it("generates a proposal and queues only the reviewed values", async () => {
    const { deps, enqueue, generateObject, profileContent } = createDeps();
    const tool = createLinkedInDistillationTools("linkedin-import", deps)[0];
    if (!tool) throw new Error("Profile distillation tool not registered");

    const confirmation = expectConfirmation(
      await tool.handler({}, toolContext),
    );

    expect(generateObject).toHaveBeenCalledTimes(1);
    expect(confirmation.preview).toContain(proposal.tagline);
    expect(confirmation.preview).toContain(
      "Structured professional fields, including headline, remain unchanged",
    );
    expect(enqueue).not.toHaveBeenCalled();

    const result = await tool.handler(getArgs(confirmation), toolContext);

    expect(enqueue).toHaveBeenCalledWith({
      type: "linkedin-profile-distill",
      data: {
        proposal,
        expectedProfileDigest: profileContentDigest(profileContent),
      },
    });
    expect(result).toEqual({
      success: true,
      data: { jobId: "distill-job-1", status: "queued" },
    });
  });

  it("rejects forged approval", async () => {
    const { deps, enqueue } = createDeps();
    const tool = createLinkedInDistillationTools("linkedin-import", deps)[0];
    if (!tool) throw new Error("Profile distillation tool not registered");

    const result = await tool.handler(
      {
        confirmed: true,
        confirmationToken: "forged",
        expectedProfileDigest: "0".repeat(64),
        proposal,
      },
      toolContext,
    );

    expect(result).toMatchObject({ success: false });
    expect(enqueue).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, mock } from "bun:test";
import type { IEntityService } from "@brains/plugins";
import {
  createMockProgressReporter,
  createSilentLogger,
  createTestEntity,
} from "@brains/test-utils";
import { LinkedInDistillationJobHandler } from "../src/handlers/linkedin-distillation-handler";
import { profileContentDigest } from "../src/lib/profile-import-digest";

const proposal = {
  tagline: "Designing resilient systems for meaningful work.",
  intro: "Ada helps teams turn complex systems into dependable products.",
  story:
    "Ada is a systems architect focused on resilient infrastructure.\n\nHer work connects technical depth with practical outcomes.",
};

describe("LinkedInDistillationJobHandler", () => {
  it("applies only the reviewed proposal", async () => {
    let profile = createTestEntity("anchor-profile", {
      id: "anchor-profile",
      content:
        "---\nname: Ada Morgan\nheadline: Systems Architect\n---\nOriginal story.\n",
    });
    const updateEntity = mock(async (request: { entity: typeof profile }) => {
      profile = request.entity;
      return {
        entityId: "anchor-profile",
        jobId: "embedding-job",
        skipped: false,
      };
    });
    const handler = new LinkedInDistillationJobHandler(createSilentLogger(), {
      getEntity: mock(async () => profile),
      updateEntity,
    } as unknown as IEntityService);

    const result = await handler.process(
      {
        proposal,
        expectedProfileDigest: profileContentDigest(profile.content),
      },
      "job-1",
      createMockProgressReporter(),
    );

    expect(result).toEqual({
      updated: true,
      changedFields: ["tagline", "intro", "story"],
    });
    expect(profile.content).toContain("headline: Systems Architect");
    expect(profile.content).toContain(proposal.tagline);
    expect(profile.content).toContain(proposal.story);
  });

  it("rejects a stale reviewed proposal", async () => {
    const profile = createTestEntity("anchor-profile", {
      id: "anchor-profile",
      content: "---\nname: Owner Edit\n---\n",
    });
    const updateEntity = mock(async () => ({
      entityId: "anchor-profile",
      jobId: "embedding-job",
      skipped: false,
    }));
    const handler = new LinkedInDistillationJobHandler(createSilentLogger(), {
      getEntity: mock(async () => profile),
      updateEntity,
    } as unknown as IEntityService);

    expect(
      handler.process(
        {
          proposal,
          expectedProfileDigest: profileContentDigest(
            "---\nname: Preview Baseline\n---\n",
          ),
        },
        "job-1",
        createMockProgressReporter(),
      ),
    ).rejects.toThrow("changed since narrative review");
    expect(updateEntity).not.toHaveBeenCalled();
  });

  it("does not clobber an edit concurrent with the reviewed update", async () => {
    const profile = createTestEntity("anchor-profile", {
      id: "anchor-profile",
      content: "---\nname: Ada Morgan\n---\nOriginal story.\n",
    });
    const handler = new LinkedInDistillationJobHandler(createSilentLogger(), {
      getEntity: mock(async () => profile),
      updateEntity: mock(async () => ({
        entityId: "anchor-profile",
        jobId: "",
        skipped: true,
        skipReason: "content-conflict" as const,
      })),
    } as unknown as IEntityService);

    expect(
      handler.process(
        {
          proposal,
          expectedProfileDigest: profileContentDigest(profile.content),
        },
        "job-1",
        createMockProgressReporter(),
      ),
    ).rejects.toThrow("changed during narrative update");
  });
});

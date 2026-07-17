import { describe, expect, it, mock } from "bun:test";
import type { IEntityService } from "@brains/plugins";
import {
  createMockProgressReporter,
  createSilentLogger,
  createTestEntity,
} from "@brains/test-utils";
import { LinkedInImportJobHandler } from "../src/handlers/linkedin-import-handler";

const profileRecords = [
  {
    "First Name": "Ada",
    "Last Name": "Morgan",
    Headline: "Imported headline",
    Industry: "Climate Technology",
    Summary: "Imported story.",
  },
];

describe("LinkedInImportJobHandler", () => {
  it("merges the profile and is idempotent on rerun", async () => {
    let profile = createTestEntity("anchor-profile", {
      id: "anchor-profile",
      content: `---
name: Unknown
kind: professional
headline: Owner-authored headline
---
`,
    });
    const updateEntity = mock(async (request: { entity: typeof profile }) => {
      profile = request.entity;
      return {
        entityId: "anchor-profile",
        jobId: "embedding-job",
        skipped: false,
      };
    });
    const entityService = {
      getEntity: mock(async () => profile),
      updateEntity,
    } as unknown as IEntityService;
    const handler = new LinkedInImportJobHandler(createSilentLogger(), {
      client: { fetchDomain: mock(async () => profileRecords) },
      entityService,
    });

    const first = await handler.process(
      {},
      "job-1",
      createMockProgressReporter(),
    );
    const second = await handler.process(
      {},
      "job-2",
      createMockProgressReporter(),
    );

    expect(first).toEqual({
      recordsRead: 1,
      updated: true,
      appliedFields: ["name", "industry", "story"],
      preservedFields: ["headline"],
    });
    expect(second).toEqual({
      recordsRead: 1,
      updated: false,
      appliedFields: [],
      preservedFields: ["headline"],
    });
    expect(updateEntity).toHaveBeenCalledTimes(1);
    expect(profile.content).toContain("name: Ada Morgan");
    expect(profile.content).toContain("headline: Owner-authored headline");
    expect(profile.content).toContain("Imported story.");
  });

  it("fails clearly when the anchor profile is missing", async () => {
    const entityService = {
      getEntity: mock(async () => null),
    } as unknown as IEntityService;
    const handler = new LinkedInImportJobHandler(createSilentLogger(), {
      client: { fetchDomain: mock(async () => profileRecords) },
      entityService,
    });

    expect(
      handler.process({}, "job-1", createMockProgressReporter()),
    ).rejects.toThrow("Anchor profile not found");
  });

  it("retries rather than clobbering a concurrent profile edit", async () => {
    const profile = createTestEntity("anchor-profile", {
      id: "anchor-profile",
      content: "---\nname: Unknown\nkind: professional\n---\n",
    });
    const entityService = {
      getEntity: mock(async () => profile),
      updateEntity: mock(async () => ({
        entityId: "anchor-profile",
        jobId: "",
        skipped: true,
        skipReason: "content-conflict" as const,
      })),
    } as unknown as IEntityService;
    const handler = new LinkedInImportJobHandler(createSilentLogger(), {
      client: { fetchDomain: mock(async () => profileRecords) },
      entityService,
    });

    expect(
      handler.process({}, "job-1", createMockProgressReporter()),
    ).rejects.toThrow("changed during LinkedIn import");
  });
});

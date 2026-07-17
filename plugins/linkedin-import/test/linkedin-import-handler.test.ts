import { describe, expect, it, mock } from "bun:test";
import type { IEntityService } from "@brains/plugins";
import {
  createMockProgressReporter,
  createSilentLogger,
  createTestEntity,
} from "@brains/test-utils";
import { LinkedInImportJobHandler } from "../src/handlers/linkedin-import-handler";
import { profileImportPreviewDigest } from "../src/lib/profile-import-digest";
import { mapLinkedInProfile } from "../src/lib/transform/profile-mapper";

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

    const patch = mapLinkedInProfile(profileRecords);
    const first = await handler.process(
      {
        expectedPreviewDigest: profileImportPreviewDigest(
          patch,
          profile.content,
        ),
      },
      "job-1",
      createMockProgressReporter(),
    );
    const second = await handler.process(
      {
        expectedPreviewDigest: profileImportPreviewDigest(
          patch,
          profile.content,
        ),
      },
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

  it("rejects execution when source data or the profile changed after preview", async () => {
    const updateEntity = mock(async () => ({
      entityId: "anchor-profile",
      jobId: "embedding-job",
      skipped: false,
    }));
    const entityService = {
      getEntity: mock(async () =>
        createTestEntity("anchor-profile", {
          id: "anchor-profile",
          content: "---\nname: Unknown\nkind: professional\n---\n",
        }),
      ),
      updateEntity,
    } as unknown as IEntityService;
    const handler = new LinkedInImportJobHandler(createSilentLogger(), {
      client: { fetchDomain: mock(async () => profileRecords) },
      entityService,
    });

    expect(
      handler.process(
        {
          expectedPreviewDigest: profileImportPreviewDigest(
            mapLinkedInProfile(profileRecords),
            "---\nname: Preview Baseline\nkind: professional\n---\n",
          ),
        },
        "job-1",
        createMockProgressReporter(),
      ),
    ).rejects.toThrow("changed since the import preview");
    expect(updateEntity).not.toHaveBeenCalled();
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

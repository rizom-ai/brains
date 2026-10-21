import { describe, expect, it } from "bun:test";
import { recentBuildItems } from "../../src/lib/recent-build-items";
import type { RecentSiteBuild } from "../../src/lib/site-build-status";

const UNCHANGED = "Site inputs were unchanged; no render was published";

function build(
  jobId: string,
  outcome: RecentSiteBuild["outcome"],
  completedAt: string,
  environment: RecentSiteBuild["environment"] = "preview",
): RecentSiteBuild {
  return {
    jobId,
    environment,
    outcome,
    completedAt,
    routesBuilt: 31,
    ...(outcome === "skipped" ? { message: UNCHANGED } : {}),
  };
}

describe("recentBuildItems", () => {
  it("lists the environment's builds, newest first as recorded", () => {
    const items = recentBuildItems(
      [
        build("b2", "succeeded", "2026-10-21T12:00:00.000Z"),
        build("p1", "succeeded", "2026-10-21T11:30:00.000Z", "production"),
        build("b1", "failed", "2026-10-21T11:00:00.000Z"),
      ],
      "preview",
    );
    expect(items.map((item) => item.id)).toEqual(["b2", "b1"]);
    expect(items[0]).toMatchObject({
      title: "preview · succeeded",
      tone: "good",
      metadata: ["Completed: 2026-10-21T12:00:00.000Z", "Routes: 31"],
    });
    expect(items[1]?.tone).toBe("error");
  });

  it("folds a run of skipped builds into one entry, so they cannot crowd out renders", () => {
    const items = recentBuildItems(
      [
        build("s4", "skipped", "2026-10-21T12:04:00.000Z"),
        build("s3", "skipped", "2026-10-21T12:03:00.000Z"),
        build("s2", "skipped", "2026-10-21T12:02:00.000Z"),
        build("ok", "succeeded", "2026-10-21T12:01:00.000Z"),
        build("s1", "skipped", "2026-10-21T12:00:00.000Z"),
      ],
      "preview",
    );
    expect(items.map((item) => item.id)).toEqual(["s4", "ok", "s1"]);
    expect(items[0]).toMatchObject({
      title: "preview · skipped ×3",
      description: UNCHANGED,
      tone: "neutral",
      metadata: ["Latest: 2026-10-21T12:04:00.000Z"],
    });
    expect(items[2]?.title).toBe("preview · skipped");
  });
});

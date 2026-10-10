import { describe, it, expect } from "bun:test";
import { trafficSnapshotAdapter } from "../src/entity/adapter";
import {
  trafficSnapshotSchema,
  type TrafficSnapshotFrontmatter,
} from "../src/entity/schema";

const frontmatter: TrafficSnapshotFrontmatter = {
  week: "2026-W41",
  start: "2026-10-05",
  end: "2026-10-11",
  days: [
    {
      date: "2026-10-05",
      pageviews: 49,
      visits: 10,
      estimated: false,
      paths: [
        { path: "/", pageviews: 20 },
        { path: "/essays/the-machine-finds-the-cracks", pageviews: 8 },
      ],
      referrers: [{ host: "www.linkedin.com", visits: 4 }],
      pathReferrers: [
        {
          path: "/essays/the-machine-finds-the-cracks",
          host: "www.linkedin.com",
          visits: 3,
        },
      ],
      countries: [{ country: "TW", visits: 6 }],
    },
    {
      date: "2026-10-06",
      pageviews: 120,
      visits: 40,
      estimated: true,
      paths: [],
      referrers: [],
      pathReferrers: [],
      countries: [],
    },
  ],
};

describe("traffic snapshot adapter", () => {
  it("round-trips the week's days through markdown", () => {
    const markdown = trafficSnapshotAdapter.createContent(frontmatter);

    expect(trafficSnapshotAdapter.parseContent(markdown)).toEqual(frontmatter);
  });

  it("derives the week's title and totals as metadata", () => {
    const markdown = trafficSnapshotAdapter.createContent(frontmatter);

    expect(trafficSnapshotAdapter.fromMarkdown(markdown)).toMatchObject({
      entityType: "traffic-snapshot",
      visibility: "restricted",
      metadata: {
        title: "Traffic 2026-W41",
        week: "2026-W41",
        start: "2026-10-05",
        end: "2026-10-11",
        pageviews: 169,
        visits: 50,
      },
    });
  });

  it("writes a readable summary with one row per day, marking estimates", () => {
    const body = trafficSnapshotAdapter
      .createContent(frontmatter)
      .split("---")
      .slice(2)
      .join("---");

    expect(body).toContain("169 pageviews and 50 visits");
    expect(body).toContain("| 2026-10-05 | 49 | 10 |");
    expect(body).toContain("| 2026-10-06 | 120 (estimate) | 40 |");
  });

  it("accepts only restricted snapshots", () => {
    const entity = {
      id: "2026-W41",
      entityType: "traffic-snapshot",
      content: trafficSnapshotAdapter.createContent(frontmatter),
      contentHash: "hash",
      created: "2026-10-09T00:00:00.000Z",
      updated: "2026-10-09T00:00:00.000Z",
      visibility: "restricted",
      metadata: {
        title: "Traffic 2026-W41",
        week: "2026-W41",
        start: "2026-10-05",
        end: "2026-10-11",
        pageviews: 169,
        visits: 50,
      },
    };

    expect(trafficSnapshotSchema.safeParse(entity).success).toBe(true);
    expect(
      trafficSnapshotSchema.safeParse({ ...entity, visibility: "public" })
        .success,
    ).toBe(false);
  });
});

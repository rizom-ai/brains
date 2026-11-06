import { BaseEntityAdapter } from "@brains/plugins";
import { isoWeekOf, type IsoWeek } from "../lib/iso-week";
import {
  trafficSnapshotFrontmatterSchema,
  trafficSnapshotSchema,
  type TrafficSnapshot,
  type TrafficSnapshotFrontmatter,
  type TrafficSnapshotMetadata,
} from "./schema";

const formatCount = (n: number): string => n.toLocaleString("en");

/** The ISO week a snapshot covers, from its first day. */
function weekOf(frontmatter: TrafficSnapshotFrontmatter): IsoWeek {
  const first = frontmatter.days[0];
  if (!first) throw new Error("A traffic snapshot holds at least one day");
  return isoWeekOf(first.date);
}

/** The body: the week's totals in a sentence, then a row per day. */
function summarize(frontmatter: TrafficSnapshotFrontmatter): string {
  const totals = weekTotals(frontmatter);
  const week = weekOf(frontmatter);
  const rows = frontmatter.days.map(
    (day) =>
      `| ${day.date} | ${formatCount(day.pageviews)}${day.estimated ? " (estimate)" : ""} | ${formatCount(day.visits)} |`,
  );
  return [
    `# Traffic ${week.id}`,
    "",
    `${formatCount(totals.pageviews)} pageviews and ${formatCount(totals.visits)} visits from ${week.start} to ${week.end}.`,
    "",
    "| Date | Pageviews | Visits |",
    "| --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function weekTotals(frontmatter: TrafficSnapshotFrontmatter): {
  pageviews: number;
  visits: number;
} {
  return frontmatter.days.reduce(
    (sum, day) => ({
      pageviews: sum.pageviews + day.pageviews,
      visits: sum.visits + day.visits,
    }),
    { pageviews: 0, visits: 0 },
  );
}

export class TrafficSnapshotAdapter extends BaseEntityAdapter<
  TrafficSnapshot,
  TrafficSnapshotMetadata,
  TrafficSnapshotFrontmatter
> {
  constructor() {
    super({
      entityType: "traffic-snapshot",
      purpose:
        "A week of site traffic captured from Cloudflare Web Analytics: per day pageviews, visits, top paths, referrers and countries. Restricted operational data for the owner.",
      schema: trafficSnapshotSchema,
      frontmatterSchema: trafficSnapshotFrontmatterSchema,
    });
  }

  /** The snapshot's markdown, its body rebuilt from the numbers. */
  createContent(frontmatter: TrafficSnapshotFrontmatter): string {
    const parsed = trafficSnapshotFrontmatterSchema.parse(frontmatter);
    return this.buildMarkdown(summarize(parsed), parsed);
  }

  parseContent(content: string): TrafficSnapshotFrontmatter {
    return this.parseFrontMatter(content, trafficSnapshotFrontmatterSchema);
  }

  metadataFor(
    frontmatter: TrafficSnapshotFrontmatter,
  ): TrafficSnapshotMetadata {
    return {
      title: `Traffic ${weekOf(frontmatter).id}`,
      ...weekTotals(frontmatter),
    };
  }

  fromMarkdown(markdown: string): Partial<TrafficSnapshot> {
    return {
      entityType: "traffic-snapshot",
      visibility: "restricted",
      content: markdown,
      metadata: this.metadataFor(this.parseContent(markdown)),
    };
  }
}

export const trafficSnapshotAdapter: TrafficSnapshotAdapter =
  new TrafficSnapshotAdapter();

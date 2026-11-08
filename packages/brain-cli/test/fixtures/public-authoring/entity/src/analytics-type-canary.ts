import {
  defineEntity,
  defineEntityAnalyticsReport,
  z,
  type EntityAnalyticsReportContext,
  type EntityAnalyticsReportDeclaration,
} from "@rizom/brain/entities";
import { bookmark, readingDigest } from "./index";

// Compile-only: checked by the fixture typecheck, never loaded by the brain.
async function digestCoverage(
  context: EntityAnalyticsReportContext,
): Promise<number> {
  const [saved, digests] = await Promise.all([
    context.entities.count(bookmark),
    context.entities.count(readingDigest),
  ]);
  return saved === 0 ? 1 : digests / saved;
}

const tagReport = defineEntityAnalyticsReport({
  type: "reading-tags",
  description: "The tags the reader saves pages under, most used first.",
  params: z.object({ limit: z.number().int().positive().max(50).default(10) }),
  report: async ({ limit }, context) => {
    const saved = await context.entities.list(bookmark, { limit: 500 });
    const counts = new Map<string, number>();
    saved.forEach(({ metadata }) =>
      metadata.tags.forEach((tag) =>
        counts.set(tag, (counts.get(tag) ?? 0) + 1),
      ),
    );
    return {
      visibility: context.visibility,
      coverage: await digestCoverage(context),
      tags: [...counts.entries()]
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .map(([tag, count]) => ({ tag, count })),
    };
  },
});

const auditParams = z.object({});
const auditReport: EntityAnalyticsReportDeclaration<typeof auditParams> =
  defineEntityAnalyticsReport({
    type: "reading-audit",
    description: "Every saved page, for the operator.",
    params: auditParams,
    minVisibility: "admin",
    report: async (_params, { entities }) => ({
      total: await entities.count(bookmark),
    }),
  });

export const readingStats = defineEntity({
  type: "reading-stats",
  purpose: "Reports on what the reader saves.",
  metadata: z.object({}),
  analyticsReports: [tagReport, auditReport],
});

export const invalidParams = defineEntityAnalyticsReport({
  type: "invalid-params",
  description: "Compile-only rejection",
  params: z.object({ limit: z.number() }),
  // @ts-expect-error A report reads the params its schema parses.
  report: async ({ since }) => ({ since }),
});

export const invalidFloor = defineEntityAnalyticsReport({
  type: "invalid-floor",
  description: "Compile-only rejection",
  params: z.object({}),
  // @ts-expect-error The floor is a permission level.
  minVisibility: "everyone",
  report: async () => ({}),
});

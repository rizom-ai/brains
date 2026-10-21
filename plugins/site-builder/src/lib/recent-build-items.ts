import type { RecentSiteBuild } from "./site-build-status";

export interface RecentBuildItem {
  id: string;
  title: string;
  description?: string;
  tone: "good" | "error" | "neutral";
  metadata: string[];
}

function buildItem(build: RecentSiteBuild): RecentBuildItem {
  return {
    id: build.jobId,
    title: `${build.environment} · ${build.outcome}`,
    ...(build.message === undefined ? {} : { description: build.message }),
    tone:
      build.outcome === "succeeded"
        ? "good"
        : build.outcome === "failed"
          ? "error"
          : "neutral",
    metadata: [
      `Completed: ${build.completedAt}`,
      ...(build.routesBuilt === undefined
        ? []
        : [`Routes: ${build.routesBuilt}`]),
      ...(build.warnings?.length ? [`Warnings: ${build.warnings.length}`] : []),
    ],
  };
}

/**
 * The environment's recent builds as list entries. Every content edit can
 * queue a build that finds nothing changed; a run of those skips folds into
 * one entry so it cannot push the renders that did happen off the list.
 */
export function recentBuildItems(
  builds: readonly RecentSiteBuild[],
  environment: RecentSiteBuild["environment"],
): RecentBuildItem[] {
  const runs = builds
    .filter((build) => build.environment === environment)
    .reduce<RecentSiteBuild[][]>((grouped, build) => {
      const last = grouped[grouped.length - 1];
      if (last?.[0]?.outcome === "skipped" && build.outcome === "skipped")
        return [...grouped.slice(0, -1), [...last, build]];
      return [...grouped, [build]];
    }, []);
  return runs.flatMap(([latest, ...rest]) => {
    if (!latest) return [];
    if (rest.length === 0) return [buildItem(latest)];
    return [
      {
        id: latest.jobId,
        title: `${latest.environment} · skipped ×${rest.length + 1}`,
        ...(latest.message === undefined
          ? {}
          : { description: latest.message }),
        tone: "neutral" as const,
        metadata: [`Latest: ${latest.completedAt}`],
      },
    ];
  });
}

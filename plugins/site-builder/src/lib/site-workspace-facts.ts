import type { SiteBuildEnvironmentStatus } from "./site-build-status";
import type { SitePublicationStatus } from "./site-publication-status";

export interface SiteFact {
  label: string;
  value: string;
}

/** What a reader needs about the live copy: when, and how many pages. */
export function publicationFacts(
  publication: SitePublicationStatus,
): SiteFact[] {
  if (publication.state === "published")
    return [
      { label: "Published at", value: publication.publishedAt },
      { label: "Pages", value: String(publication.routesBuilt) },
    ];
  if (publication.state === "unreadable")
    return [{ label: "Why", value: publication.message }];
  return [];
}

/** The diagnostic record behind the summary, build id included. */
export function renderDetailFacts(
  environment: SiteBuildEnvironmentStatus & {
    publication: SitePublicationStatus;
  },
): SiteFact[] {
  return [
    ...(environment.publication.state === "published"
      ? [{ label: "Published build", value: environment.publication.buildId }]
      : []),
    {
      label: "Last successful render",
      value: environment.lastSuccess?.completedAt ?? "—",
    },
    {
      label: "Rendered result",
      value: environment.lastSuccess
        ? `${environment.lastSuccess.routesBuilt} routes · ${environment.lastSuccess.jobId}`
        : "no successful render",
    },
    ...(environment.lastFailure
      ? [
          {
            label: "Last failed attempt",
            value: environment.lastFailure.completedAt,
          },
          { label: "Failed job", value: environment.lastFailure.jobId },
        ]
      : []),
  ];
}

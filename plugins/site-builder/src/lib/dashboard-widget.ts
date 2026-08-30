import {
  defineDashboardWidget,
  registerBuiltInDashboardWidget,
  type DashboardOperatorViewBlock,
  type ServicePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { createElement as h, type ReactNode } from "react";
import {
  sitePublicationStatusSchema,
  type SitePublicationStatus,
} from "./site-publication-status";
import type { SiteWorkspaceProvider } from "./site-workspace";

interface EnvironmentHealth {
  environment: "preview" | "production";
  publication?: SitePublicationStatus | undefined;
  active?:
    | {
        jobId?: string | undefined;
        state: "debouncing" | "queued" | "building";
        requestedAt?: string | undefined;
        startedAt?: string | undefined;
      }
    | undefined;
  lastSuccess?:
    | { completedAt: string; routesBuilt: number; warnings: string[] }
    | undefined;
  lastFailure?:
    | { jobId?: string | undefined; completedAt: string; message: string }
    | undefined;
  lastCancellation?: { completedAt: string; message: string } | undefined;
}

interface SiteHealthWidgetData {
  site: {
    title: string;
    previewUrl?: string | undefined;
    liveUrl?: string | undefined;
  };
  environments: EnvironmentHealth[];
  managementUrl?: string | undefined;
}

const environmentSchema: z.ZodType<EnvironmentHealth> = z.object({
  environment: z.enum(["preview", "production"]),
  publication: sitePublicationStatusSchema.optional(),
  active: z
    .object({
      jobId: z.string().optional(),
      state: z.enum(["debouncing", "queued", "building"]),
      requestedAt: z.string().optional(),
      startedAt: z.string().optional(),
    })
    .optional(),
  lastSuccess: z
    .object({
      completedAt: z.string(),
      routesBuilt: z.number(),
      warnings: z.array(z.string()),
    })
    .optional(),
  lastFailure: z
    .object({
      jobId: z.string().optional(),
      completedAt: z.string(),
      message: z.string(),
    })
    .optional(),
  lastCancellation: z
    .object({
      completedAt: z.string(),
      message: z.string(),
    })
    .optional(),
});

const siteHealthWidgetDataSchema: z.ZodType<SiteHealthWidgetData> = z.object({
  site: z.object({
    title: z.string(),
    previewUrl: z.string().optional(),
    liveUrl: z.string().optional(),
  }),
  environments: z.array(environmentSchema),
  managementUrl: z.string().optional(),
});

function boundedDetail(value: string): string {
  return value.length <= 500 ? value : `${value.slice(0, 497)}…`;
}

/** "environment · jobId" — the one way a failed attempt is labelled anywhere. */
function failureLabel(failure: EnvironmentHealth): string {
  const attempt = failure.lastFailure?.jobId
    ? ` · ${failure.lastFailure.jobId}`
    : "";
  return `${failure.environment}${attempt}`;
}

function failureBlocks(
  failures: readonly EnvironmentHealth[],
): DashboardOperatorViewBlock[] {
  if (failures.length === 0) return [];
  return [
    {
      type: "notice",
      id: "build-failures",
      title: "Previous build failures",
      text: failures
        .map((failure) => {
          const previous = failure.lastFailure;
          const completed = previous?.completedAt
            ? ` · ${previous.completedAt}`
            : "";
          return `${failureLabel(failure)}${completed}: ${boundedDetail(previous?.message ?? "Build failed without details.")}`;
        })
        .join("\n"),
      tone: "error",
    },
  ];
}

function siteLinks(data: SiteHealthWidgetData): DashboardOperatorViewBlock {
  return {
    type: "links",
    items: [
      ...(data.site.previewUrl
        ? [
            {
              label: "Open preview",
              target: { external: data.site.previewUrl },
            },
          ]
        : []),
      ...(data.site.liveUrl
        ? [
            {
              label: "Open live",
              target: { external: data.site.liveUrl },
            },
          ]
        : []),
      {
        label: "Open in Studio",
        target: { launch: { target: "site" } },
      },
    ],
  };
}

export function siteHealthDigest(data: SiteHealthWidgetData): {
  items: { label: string; value: string; tone: "good" | "warn" }[];
  attention: number;
} {
  const preview = data.environments.find(
    (environment) => environment.environment === "preview",
  );
  const production = data.environments.find(
    (environment) => environment.environment === "production",
  );
  const failures = data.environments.filter(
    (environment) => environment.lastFailure !== undefined,
  ).length;
  const previewPresentation = presentEnvironment(preview);
  const productionPresentation = presentEnvironment(production);
  return {
    items: [
      {
        label: "Preview",
        value: previewPresentation.state,
        tone: previewPresentation.tone,
      },
      {
        label: "Live",
        value: productionPresentation.state,
        tone: productionPresentation.tone,
      },
    ],
    attention: failures,
  };
}

const siteHealthWidget = defineDashboardWidget({
  id: "site-health",
  title: "Site health",
  description: "Preview and live build status",
  group: "publishing",
  placement: "sidebar",
  priority: 50,
  permission: "admin",
  data: siteHealthWidgetDataSchema,
  digest: ({ data }) => siteHealthDigest(data),
  view: ({ data }) => {
    const preview = data.environments.find(
      (environment) => environment.environment === "preview",
    );
    const production = data.environments.find(
      (environment) => environment.environment === "production",
    );
    const failures = data.environments.filter(
      (environment) => environment.lastFailure !== undefined,
    );
    const previewPresentation = presentEnvironment(preview);
    const productionPresentation = presentEnvironment(production);
    return {
      blocks: [
        {
          type: "stats",
          items: [
            {
              label: "Preview",
              value: previewPresentation.state,
              tone: previewPresentation.tone,
            },
            {
              label: "Live",
              value: productionPresentation.state,
              tone: productionPresentation.tone,
            },
          ],
        },
        {
          type: "key-values",
          items: [
            {
              label: "Preview detail",
              value: boundedDetail(previewPresentation.detail),
            },
            {
              label: "Live detail",
              value: boundedDetail(productionPresentation.detail),
            },
          ],
        },
        ...failureBlocks(failures),
        siteLinks(data),
      ],
    };
  },
});

interface SiteHealthWidgetProps {
  title: string;
  data: unknown;
}

interface EnvironmentPresentation {
  state: string;
  detail: string;
  tone: "good" | "warn";
}

/**
 * The single precedence walk for how an environment renders. State, detail,
 * and tone always come from the same branch, so no surface can pair a live
 * attempt with a stale failure — the contradiction this widget once shipped.
 * Tone tracks the current attempt; failed history stays in the failures
 * section and the digest's attention count.
 */
function presentEnvironment(
  environment: EnvironmentHealth | undefined,
): EnvironmentPresentation {
  if (!environment) {
    return { state: "unavailable", detail: "Unavailable", tone: "good" };
  }
  if (environment.active) {
    return {
      state: environment.active.state,
      detail: [environment.active.state, environment.active.jobId]
        .filter((value): value is string => value !== undefined)
        .join(" · "),
      tone: "good",
    };
  }
  if (environment.publication?.state === "unreadable") {
    return {
      state: "unknown",
      detail: environment.publication.message,
      tone: "warn",
    };
  }
  if (environment.lastCancellation) {
    // Supersede cancellations are routine, so they don't demand attention.
    return {
      state: "cancelled",
      detail: environment.lastCancellation.message,
      tone: "good",
    };
  }
  if (environment.lastFailure) {
    const retained =
      environment.publication?.state === "published"
        ? ` Published generation ${environment.publication.buildId} remains active.`
        : "";
    return {
      state: "failed",
      detail: `${environment.lastFailure.message}${retained}`,
      tone: "warn",
    };
  }
  if (environment.publication?.state === "published") {
    const publication = environment.publication;
    return {
      state: "published",
      detail: `${publication.routesBuilt} published routes · ${publication.buildId} · ${publication.publishedAt}`,
      tone: "good",
    };
  }
  if (environment.lastSuccess) {
    const warningLabel =
      environment.lastSuccess.warnings.length > 0
        ? ` · ${environment.lastSuccess.warnings.length} warning`
        : "";
    return {
      state: "rendered",
      detail: `${environment.lastSuccess.routesBuilt} routes rendered${warningLabel}`,
      tone: "good",
    };
  }
  return {
    state: "not built",
    detail: "No published generation",
    tone: "good",
  };
}

function EnvironmentMetric(props: {
  label: string;
  environment: EnvironmentHealth | undefined;
}): ReactNode {
  const presentation = presentEnvironment(props.environment);
  return h(
    "div",
    {
      class: `pipeline-metric site-health-metric site-health-metric--${presentation.state}`,
    },
    [
      h("dt", {}, [
        h("span", { class: "site-health-dot", "aria-hidden": "true" }),
        props.label,
      ]),
      h("dd", {}, presentation.state),
      props.environment
        ? h("small", { class: "muted" }, presentation.detail)
        : null,
    ],
  );
}

function actionLink(
  href: string,
  label: string,
  kind: "external" | "manage" = "external",
): ReactNode {
  return h(
    "a",
    {
      class: `widget-action widget-action--${kind === "manage" ? "primary" : "secondary"}`,
      href,
      ...(kind === "external" ? { target: "_blank", rel: "noreferrer" } : {}),
    },
    [
      h("span", {}, label),
      h(
        "span",
        { class: "widget-action-arrow", "aria-hidden": "true" },
        kind === "external" ? "↗" : "→",
      ),
    ],
  );
}

export function SiteHealthWidget(props: SiteHealthWidgetProps): ReactNode {
  const parsed = siteHealthWidgetDataSchema.safeParse(props.data);
  if (!parsed.success) {
    return h("p", { class: "muted" }, "Site health is unavailable.");
  }

  const data = parsed.data;
  const preview = data.environments.find(
    (environment) => environment.environment === "preview",
  );
  const production = data.environments.find(
    (environment) => environment.environment === "production",
  );
  const failures = data.environments.filter(
    (environment) => environment.lastFailure !== undefined,
  );
  const links: ReactNode[] = [];
  if (data.site.previewUrl) {
    links.push(actionLink(data.site.previewUrl, "Open preview"));
  }
  if (data.site.liveUrl) {
    links.push(actionLink(data.site.liveUrl, "Open live"));
  }
  if (data.managementUrl) {
    links.push(actionLink(data.managementUrl, "Open in Studio", "manage"));
  }

  return h("div", { class: "pipeline-digest site-health-widget" }, [
    h("dl", { class: "pipeline-metrics" }, [
      h(EnvironmentMetric, { label: "Preview", environment: preview }),
      h(EnvironmentMetric, { label: "Live", environment: production }),
    ]),
    failures.length > 0
      ? h("section", { class: "pipeline-failures" }, [
          h("h4", {}, "Previous build failures"),
          ...failures.map((failure) =>
            h(
              "div",
              {
                class: "pipeline-failure",
                key: failure.environment,
              },
              [
                h("strong", {}, failureLabel(failure)),
                h("span", {}, failure.lastFailure?.message),
              ],
            ),
          ),
        ])
      : null,
    links.length > 0
      ? h(
          "nav",
          { class: "widget-actions", "aria-label": "Site actions" },
          links,
        )
      : null,
  ]);
}

export async function registerSiteHealthWidget(
  context: ServicePluginContext,
  provider: SiteWorkspaceProvider,
): Promise<void> {
  await registerBuiltInDashboardWidget({
    context,
    definition: siteHealthWidget,
    load: async ({ signal }): Promise<SiteHealthWidgetData> => {
      signal.throwIfAborted();
      const snapshot = await provider.getSnapshot();
      signal.throwIfAborted();
      return snapshot;
    },
  });
}

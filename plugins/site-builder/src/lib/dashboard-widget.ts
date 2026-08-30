import {
  defineDashboardWidget,
  registerBuiltInDashboardWidget,
  type DashboardOperatorViewBlock,
  type ServicePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { createElement as h, type ReactNode } from "react";
import type { SiteWorkspaceProvider } from "./site-workspace";

const publicationSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("not-published") }),
  z.object({
    state: z.literal("published"),
    buildId: z.string(),
    publishedAt: z.string(),
    routesBuilt: z.number(),
    warnings: z.array(z.string()),
  }),
  z.object({ state: z.literal("unreadable"), message: z.string() }),
]);

const environmentSchema = z.object({
  environment: z.enum(["preview", "production"]),
  publication: publicationSchema.optional(),
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

const siteHealthWidgetDataSchema = z.object({
  site: z.object({
    title: z.string(),
    previewUrl: z.string().optional(),
    liveUrl: z.string().optional(),
  }),
  environments: z.array(environmentSchema),
  managementUrl: z.string().optional(),
});

type SiteHealthWidgetData = z.output<typeof siteHealthWidgetDataSchema>;
type EnvironmentHealth = z.output<typeof environmentSchema>;

function boundedDetail(value: string): string {
  return value.length <= 500 ? value : `${value.slice(0, 497)}…`;
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
          const attempt = previous?.jobId ? ` · ${previous.jobId}` : "";
          const completed = previous?.completedAt
            ? ` · ${previous.completedAt}`
            : "";
          return `${failure.environment}${attempt}${completed}: ${boundedDetail(previous?.message ?? "Build failed without details.")}`;
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

const siteHealthWidget = defineDashboardWidget({
  id: "site-health",
  title: "Site health",
  description: "Preview and live build status",
  group: "publishing",
  placement: "sidebar",
  priority: 50,
  permission: "admin",
  data: siteHealthWidgetDataSchema,
  digest: ({ data }) => {
    const preview = data.environments.find(
      (environment) => environment.environment === "preview",
    );
    const production = data.environments.find(
      (environment) => environment.environment === "production",
    );
    const failures = data.environments.filter(
      (environment) => environment.lastFailure !== undefined,
    ).length;
    return {
      items: [
        {
          label: "Preview",
          value: preview ? environmentState(preview) : "unavailable",
          tone: preview?.lastFailure ? "warn" : "good",
        },
        {
          label: "Live",
          value: production ? environmentState(production) : "unavailable",
          tone: production?.lastFailure ? "warn" : "good",
        },
      ],
      attention: failures,
    };
  },
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
    return {
      blocks: [
        {
          type: "stats",
          items: [
            {
              label: "Preview",
              value: preview ? environmentState(preview) : "unavailable",
              tone: preview?.lastFailure ? "warn" : "good",
            },
            {
              label: "Live",
              value: production ? environmentState(production) : "unavailable",
              tone: production?.lastFailure ? "warn" : "good",
            },
          ],
        },
        {
          type: "key-values",
          items: [
            {
              label: "Preview detail",
              value: preview
                ? boundedDetail(environmentDetail(preview))
                : "Unavailable",
            },
            {
              label: "Live detail",
              value: production
                ? boundedDetail(environmentDetail(production))
                : "Unavailable",
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

function environmentState(environment: EnvironmentHealth): string {
  if (environment.active) return environment.active.state;
  if (environment.publication?.state === "unreadable") return "unknown";
  if (environment.lastCancellation) return "cancelled";
  if (environment.lastFailure) return "failed";
  if (environment.publication?.state === "published") return "published";
  if (environment.lastSuccess) return "rendered";
  return "not built";
}

function environmentDetail(environment: EnvironmentHealth): string {
  if (environment.active) {
    return [environment.active.state, environment.active.jobId]
      .filter((value): value is string => value !== undefined)
      .join(" · ");
  }
  if (environment.publication?.state === "unreadable") {
    return environment.publication.message;
  }
  if (environment.lastCancellation) return environment.lastCancellation.message;
  if (environment.lastFailure) {
    const retained =
      environment.publication?.state === "published"
        ? ` Published generation ${environment.publication.buildId} remains active.`
        : "";
    return `${environment.lastFailure.message}${retained}`;
  }
  if (environment.publication?.state === "published") {
    const publication = environment.publication;
    return `${publication.routesBuilt} published routes · ${publication.buildId} · ${publication.publishedAt}`;
  }
  if (environment.lastSuccess) {
    const warningLabel =
      environment.lastSuccess.warnings.length > 0
        ? ` · ${environment.lastSuccess.warnings.length} warning`
        : "";
    return `${environment.lastSuccess.routesBuilt} routes rendered${warningLabel}`;
  }
  return "No published generation";
}

function EnvironmentMetric(props: {
  label: string;
  environment: EnvironmentHealth | undefined;
}): ReactNode {
  const state = props.environment
    ? environmentState(props.environment)
    : "unavailable";
  return h(
    "div",
    {
      class: `pipeline-metric site-health-metric site-health-metric--${state}`,
    },
    [
      h("dt", {}, [
        h("span", { class: "site-health-dot", "aria-hidden": "true" }),
        props.label,
      ]),
      h("dd", {}, state),
      props.environment
        ? h("small", { class: "muted" }, environmentDetail(props.environment))
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
          ...failures.map((failure) => {
            const previous = failure.lastFailure;
            const attempt = previous?.jobId ? ` · ${previous.jobId}` : "";
            return h(
              "div",
              {
                class: "pipeline-failure",
                key: failure.environment,
              },
              [
                h("strong", {}, `${failure.environment}${attempt}`),
                h("span", {}, previous?.message),
              ],
            );
          }),
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

import type { ServicePluginContext } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { h, type ComponentChild } from "preact";
import type { SiteWorkspaceProvider } from "./site-workspace";

const environmentSchema = z.object({
  environment: z.enum(["preview", "production"]),
  active: z
    .object({
      state: z.enum(["debouncing", "queued", "building"]),
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

interface SiteHealthWidgetProps {
  title: string;
  data: unknown;
}

function environmentState(environment: EnvironmentHealth): string {
  if (environment.active) return environment.active.state;
  if (environment.lastFailure) return "failed";
  if (environment.lastSuccess) return "current";
  return "not built";
}

function environmentDetail(environment: EnvironmentHealth): string {
  if (environment.lastFailure) return environment.lastFailure.message;
  if (environment.lastSuccess) {
    const warningLabel =
      environment.lastSuccess.warnings.length > 0
        ? ` · ${environment.lastSuccess.warnings.length} warning`
        : "";
    return `${environment.lastSuccess.routesBuilt} routes${warningLabel}`;
  }
  return "No completed build in this runtime";
}

function EnvironmentMetric(props: {
  label: string;
  environment: EnvironmentHealth | undefined;
}): ComponentChild {
  const state = props.environment
    ? environmentState(props.environment)
    : "unavailable";
  return h("div", { class: "pipeline-metric" }, [
    h("dt", {}, props.label),
    h("dd", {}, state),
    props.environment
      ? h("small", { class: "muted" }, environmentDetail(props.environment))
      : null,
  ]);
}

function actionLink(href: string, label: string): ComponentChild {
  return h(
    "a",
    { class: "pipeline-manage", href, target: "_blank", rel: "noreferrer" },
    label,
  );
}

export function SiteHealthWidget(props: SiteHealthWidgetProps): ComponentChild {
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
  const links: ComponentChild[] = [];
  if (data.site.previewUrl) {
    links.push(actionLink(data.site.previewUrl, "Open preview ↗"));
  }
  if (data.site.liveUrl) {
    links.push(actionLink(data.site.liveUrl, "Open live ↗"));
  }
  if (data.managementUrl) {
    links.push(actionLink(data.managementUrl, "Manage in CMS →"));
  }

  return h("div", { class: "pipeline-digest" }, [
    h("dl", { class: "pipeline-metrics" }, [
      h(EnvironmentMetric, { label: "Preview", environment: preview }),
      h(EnvironmentMetric, { label: "Live", environment: production }),
    ]),
    failures.length > 0
      ? h("section", { class: "pipeline-failures" }, [
          h("h4", {}, "Needs attention"),
          ...failures.map((failure) =>
            h(
              "div",
              {
                class: "pipeline-failure",
                key: failure.environment,
              },
              [
                h("strong", {}, failure.environment),
                h("span", {}, failure.lastFailure?.message),
              ],
            ),
          ),
        ])
      : null,
    links.length > 0 ? h("div", { class: "pipeline-digest" }, links) : null,
  ]);
}

function deriveSiteDigest(data: unknown): {
  digest: Array<{ label: string; value: string; tone?: "good" | "warn" }>;
  needsOperator: number;
} {
  const parsed = siteHealthWidgetDataSchema.parse(data);
  const preview = parsed.environments.find(
    (environment) => environment.environment === "preview",
  );
  const production = parsed.environments.find(
    (environment) => environment.environment === "production",
  );
  const failures = parsed.environments.filter(
    (environment) => environment.lastFailure !== undefined,
  ).length;

  return {
    digest: [
      {
        label: "Preview",
        value: preview ? environmentState(preview) : "unavailable",
        ...(preview?.lastFailure ? { tone: "warn" } : { tone: "good" }),
      },
      {
        label: "Live",
        value: production ? environmentState(production) : "unavailable",
        ...(production?.lastFailure ? { tone: "warn" } : { tone: "good" }),
      },
    ],
    needsOperator: failures,
  };
}

export async function registerSiteHealthWidget(
  context: ServicePluginContext,
  provider: SiteWorkspaceProvider,
  managementUrl?: string,
): Promise<void> {
  await context.messaging.send({
    type: "dashboard:register-widget",
    payload: {
      id: "site-health",
      pluginId: "site-builder",
      title: "Site health",
      description: "Preview and live build status",
      group: "site",
      section: "primary",
      priority: 50,
      rendererName: "SiteHealthWidget",
      visibility: "anchor",
      component: SiteHealthWidget,
      dataProvider: async (): Promise<SiteHealthWidgetData> => ({
        ...(await provider.getSnapshot()),
        ...(managementUrl ? { managementUrl } : {}),
      }),
      digestProvider: deriveSiteDigest,
    },
  });
}

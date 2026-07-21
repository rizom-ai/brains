import type { RouteDefinition } from "@brains/site-composition";
import type { LayoutComponent } from "@brains/site-engine";
import type {
  SiteBuildDiagnostic,
  SiteBuildDiagnosticCode,
} from "../types/site-builder-types";
import { describeUnsafeOutputPath } from "./output-path";
import type { SiteViewTemplate } from "./site-view-template";

export interface PreflightSiteBuildOptions {
  routes: RouteDefinition[];
  layouts: Record<string, LayoutComponent>;
  getViewTemplate: (name: string) => SiteViewTemplate | undefined;
  staticAssets?: Record<string, string> | undefined;
}

export interface SiteBuildPreflightResult {
  diagnostics: SiteBuildDiagnostic[];
  errors: SiteBuildDiagnostic[];
  warnings: SiteBuildDiagnostic[];
}

interface DiagnosticContext {
  routeId?: string;
  sectionId?: string;
  template?: string;
  path?: string;
}

function diagnostic(
  severity: SiteBuildDiagnostic["severity"],
  code: SiteBuildDiagnosticCode,
  message: string,
  context: DiagnosticContext = {},
): SiteBuildDiagnostic {
  return { severity, code, message, ...context };
}

function validateAssetPaths(
  assets: Record<string, string> | undefined,
  context: DiagnosticContext,
): SiteBuildDiagnostic[] {
  if (!assets) return [];

  const diagnostics: SiteBuildDiagnostic[] = [];
  for (const path of Object.keys(assets)) {
    const reason = describeUnsafeOutputPath(path, "asset");
    if (!reason) continue;
    diagnostics.push(
      diagnostic(
        "error",
        "unsafe-static-asset-path",
        `Static asset path "${path}" is unsafe: ${reason}`,
        { ...context, path },
      ),
    );
  }
  return diagnostics;
}

export function preflightSiteBuild(
  options: PreflightSiteBuildOptions,
): SiteBuildPreflightResult {
  const diagnostics = validateAssetPaths(options.staticAssets, {});
  const validatedTemplates = new Set<string>();

  for (const route of options.routes) {
    const routePathIssue = describeUnsafeOutputPath(route.path, "route");
    if (routePathIssue) {
      diagnostics.push(
        diagnostic(
          "error",
          "unsafe-route-path",
          `Route "${route.id}" path "${route.path}" is unsafe: ${routePathIssue}`,
          { routeId: route.id, path: route.path },
        ),
      );
    }

    if (typeof options.layouts[route.layout] !== "function") {
      diagnostics.push(
        diagnostic(
          "error",
          "missing-layout",
          `Route "${route.id}" references missing layout "${route.layout}"`,
          { routeId: route.id, path: route.path },
        ),
      );
    }

    for (const section of route.sections) {
      const template = options.getViewTemplate(section.template);
      const templateContext = {
        routeId: route.id,
        sectionId: section.id,
        template: section.template,
        path: route.path,
      };

      if (!template) {
        diagnostics.push(
          diagnostic(
            "warning",
            "missing-template",
            `Route "${route.id}" section "${section.id}" references missing template "${section.template}"`,
            templateContext,
          ),
        );
        continue;
      }

      if (
        !template.renderers.web ||
        typeof template.renderers.web !== "function"
      ) {
        diagnostics.push(
          diagnostic(
            "warning",
            "missing-web-renderer",
            `Template "${section.template}" has no callable web renderer`,
            templateContext,
          ),
        );
      }

      if (validatedTemplates.has(section.template)) continue;
      validatedTemplates.add(section.template);
      diagnostics.push(
        ...validateAssetPaths(template.staticAssets, {
          template: section.template,
        }),
      );
    }
  }

  return {
    diagnostics,
    errors: diagnostics.filter(({ severity }) => severity === "error"),
    warnings: diagnostics.filter(({ severity }) => severity === "warning"),
  };
}

export function formatSiteBuildDiagnostic(
  diagnostic: SiteBuildDiagnostic,
): string {
  return `[${diagnostic.code}] ${diagnostic.message}`;
}

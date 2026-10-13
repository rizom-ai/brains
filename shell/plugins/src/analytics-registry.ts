import {
  permissionToVisibilityScope,
  scopeEntityReads,
  type ReadOnlyEntityService,
} from "@brains/entity-service";
import { PermissionService, type UserPermissionLevel } from "@brains/templates";
import type { AnalyticsReportDefinition } from "./contracts/analytics";
import type { z } from "@brains/utils/zod";

export interface RunAnalyticsReportRequest {
  type: string;
  params?: unknown;
  entityService: ReadOnlyEntityService;
  permission: UserPermissionLevel;
}

/**
 * The `system_analytics` reports: core registers the generic ones, plugins
 * their own.
 */
export class AnalyticsRegistry {
  private readonly definitions = new Map<string, AnalyticsReportDefinition>();

  register<TParams extends z.ZodObject>(
    definition: AnalyticsReportDefinition<TParams>,
  ): void {
    this.definitions.set(definition.type, definition);
  }

  unregister(type: string): void {
    this.definitions.delete(type);
  }

  getDefinitions(): AnalyticsReportDefinition[] {
    return Array.from(this.definitions.values());
  }

  async run(
    request: RunAnalyticsReportRequest,
  ): Promise<Record<string, unknown>> {
    const definition = this.definitions.get(request.type);
    if (!definition) {
      throw new Error(
        `Unknown analytics report: ${request.type}. Available: ${Array.from(this.definitions.keys()).join(", ")}`,
      );
    }
    const floor = definition.minVisibility ?? "public";
    if (!PermissionService.hasPermission(request.permission, floor)) {
      throw new Error(
        `The ${definition.type} report answers ${floor} callers only`,
      );
    }
    const parsed = definition.params.safeParse(request.params ?? {});
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "params"}: ${issue.message}`)
        .join("; ");
      throw new Error(`Invalid params for ${definition.type}: ${issues}`);
    }
    const visibilityScope = permissionToVisibilityScope(request.permission);
    // A public caller is a site's visitor: every report, a plugin's too,
    // reads their view, where drafts are not there to count or list.
    const entityService =
      visibilityScope === "public"
        ? scopeEntityReads(request.entityService, {
            publishedOnly: true,
            visibilityScope,
          })
        : request.entityService;
    return definition.handler(parsed.data, { entityService, visibilityScope });
  }
}

export type IAnalyticsRegistry = Pick<
  AnalyticsRegistry,
  "register" | "unregister" | "getDefinitions" | "run"
>;

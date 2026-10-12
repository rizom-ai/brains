import type {
  ContentVisibility,
  ReadOnlyEntityService,
} from "@brains/entity-service";
import type { UserPermissionLevel } from "@brains/templates";
import type { z } from "@brains/utils/zod";

/** What a report reads with: the caller's view, already derived. */
export interface AnalyticsReportContext {
  /**
   * The read-only projection, not the full service: a report says what
   * exists and must not write.
   */
  entityService: ReadOnlyEntityService;
  visibilityScope: ContentVisibility;
}

/**
 * One `system_analytics` report: an aggregate over the brain, with the params
 * a caller may pass. The tool shows every registered report and its params
 * to the model, and validates params against `params` before the handler
 * runs.
 */
export interface AnalyticsReportDefinition<
  TParams extends z.ZodObject = z.ZodObject,
> {
  /** Stable id the caller names, kebab-case. */
  type: string;
  /** What the report answers, for the model choosing one. */
  description: string;
  /** The report's params; `z.object({})` when it takes none. */
  params: TParams;
  /**
   * The lowest caller level the report answers. Reports over operational,
   * non-public data raise it; omitted, every caller of the tool may ask.
   */
  minVisibility?: UserPermissionLevel;
  handler: (
    params: z.output<TParams>,
    context: AnalyticsReportContext,
  ) => Promise<Record<string, unknown>>;
}

/** Declares a report, typing the handler's params from its schema. */
export function defineAnalyticsReport<TParams extends z.ZodObject>(
  definition: AnalyticsReportDefinition<TParams>,
): AnalyticsReportDefinition<TParams> {
  return definition;
}

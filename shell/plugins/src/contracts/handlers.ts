import type {
  ContentVisibility,
  ReadOnlyEntityService,
} from "@brains/entity-service";

export type EvalHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
) => Promise<TOutput>;

/**
 * Computes a domain summary over entities.
 *
 * Takes the read-only projection, not the full service: an insight reports on
 * what exists and must not write. `@brains/plugins` publishes this signature
 * to plugin authors, so widening it here would promise them less than they
 * are given.
 */
export type InsightHandler = (
  entityService: ReadOnlyEntityService,
  visibilityScope: ContentVisibility,
) => Promise<Record<string, unknown>>;

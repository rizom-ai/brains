import type {
  ContentVisibility,
  ICoreEntityService,
} from "@brains/entity-service";

export type EvalHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
) => Promise<TOutput>;

export type InsightHandler = (
  entityService: ICoreEntityService,
  visibilityScope: ContentVisibility,
) => Promise<Record<string, unknown>>;

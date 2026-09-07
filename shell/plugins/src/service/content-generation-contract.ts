import type {
  ContentGenerationResult,
  ContentGenerationResultItem,
  ContentGenerationTarget,
  DurableGenerationContext,
} from "@brains/content-service";
import type {
  ContentVisibility,
  EntityIdPathInput,
} from "@brains/entity-service";
import type { z } from "@brains/utils/zod";
import type { AnyEntityDefinition } from "../entity/entity-definition-contract";

export type ServiceEntityIdPath = EntityIdPathInput;
export type ServiceContentGenerationContext = DurableGenerationContext;

export interface ServiceContentGenerationTargetInput<
  TDefinition extends AnyEntityDefinition,
  TTemplateName extends string = string,
> {
  readonly template: TTemplateName;
  readonly context?: ServiceContentGenerationContext | undefined;
  readonly destination: {
    readonly entity: TDefinition;
    readonly idPath: ServiceEntityIdPath;
    /** Only the entity argument determines metadata inference. */
    readonly metadata: z.input<NoInfer<TDefinition>["metadata"]>;
    readonly visibility?: ContentVisibility | undefined;
  };
}

/** Nominal marker: a target validated by this service's `content.target()`. */
export const serviceContentTargetBrand: unique symbol = Symbol(
  "service-content-target",
);
export type ServiceContentGenerationTarget =
  Readonly<ContentGenerationTarget> & {
    readonly [serviceContentTargetBrand]: true;
  };
export type ServiceContentGenerationResult = ContentGenerationResult;
export type ServiceContentGenerationItem = ContentGenerationResultItem;
export type ServiceContentGenerationSkipReason = Extract<
  ContentGenerationResultItem,
  { status: "skipped" }
>["reason"];

export interface ServiceContentGeneration<
  TTemplateName extends string = string,
> {
  target<TDefinition extends AnyEntityDefinition>(
    input: ServiceContentGenerationTargetInput<TDefinition, TTemplateName>,
  ): ServiceContentGenerationTarget;
  generate(input: {
    readonly targets: readonly ServiceContentGenerationTarget[];
    readonly force?: boolean | undefined;
    readonly dryRun?: boolean | undefined;
  }): Promise<ServiceContentGenerationResult>;
}

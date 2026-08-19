import type { z } from "@brains/utils/zod";

/**
 * The parts of an entity definition that describing a *stored entity* needs:
 * its type name and its metadata schema.
 *
 * Split out so the job context can type `entities.get(definition, id)`
 * without importing the whole entity definition contract, which imports the
 * job context back for its `generation` and `jobs` declarations. The cycle
 * was type-only and therefore harmless at runtime, but a reader still has to
 * hold both files at once to follow either.
 */
export interface EntityDefinitionShape {
  readonly type: string;
  readonly metadata: z.ZodObject<z.ZodRawShape>;
}

export type EntityVisibility = "public" | "shared" | "restricted";

export interface EntityOf<TDefinition extends EntityDefinitionShape> {
  readonly id: string;
  readonly entityType: TDefinition["type"];
  readonly content: string;
  readonly visibility: EntityVisibility;
  readonly metadata: z.output<TDefinition["metadata"]>;
  readonly contentHash: string;
  readonly created: string;
  readonly updated: string;
}

export interface EntityWriteInput<TDefinition extends EntityDefinitionShape> {
  readonly id: string;
  readonly content: string;
  readonly visibility?: EntityVisibility | undefined;
  readonly metadata: z.input<TDefinition["metadata"]>;
}

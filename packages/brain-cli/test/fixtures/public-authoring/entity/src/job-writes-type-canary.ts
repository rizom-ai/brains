import {
  defineEntity,
  defineEntityJob,
  z,
  type EntityDefinition,
  type EntityGenerationContext,
  type EntityJobHandleContext,
} from "@rizom/brain/entities";

// Compile-only: checked by the fixture typecheck, never loaded by the brain.

const tallyMetadata = z.object({ title: z.string(), count: z.number() });

// A job that does its own work writes the records of the type declaring it;
// the runtime refuses any other type.
async function bump(
  context: EntityJobHandleContext<{ readonly id: string }>,
): Promise<{ readonly id: string }> {
  const saved = await context.entities.get(tally, context.input.id);
  if (!saved) {
    return context.entities.create(tally, {
      id: context.input.id,
      content: "",
      metadata: { title: context.input.id, count: 1 },
    });
  }
  await context.entities.update(tally, saved, {
    metadata: { ...saved.metadata, count: saved.metadata.count + 1 },
  });
  if (saved.metadata.count > 99) await context.entities.delete(tally, saved);
  return { id: saved.id };
}

// A generation reads only: the runtime persists what it returns.
function generationReadsOnly(
  context: EntityGenerationContext<{ readonly id: string }>,
): void {
  // @ts-expect-error A generation's context has no writes.
  void context.entities.create;
}
void generationReadsOnly;

export const tally: EntityDefinition<"tally", typeof tallyMetadata> =
  defineEntity({
    type: "tally",
    purpose: "A count its own job keeps.",
    metadata: tallyMetadata,
    jobs: {
      bump: defineEntityJob({
        input: z.object({ id: z.string() }),
        handle: bump,
      }),
    },
  });

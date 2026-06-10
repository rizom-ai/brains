import type { BaseEntity, EntityAdapter } from "./types";

/**
 * The slice of the entity registry needed to build generation stubs.
 * Non-generic on purpose: stub construction only reads `buildStub`.
 */
export interface GenerationStubAdapterLookup {
  getAdapter(entityType: string): EntityAdapter<BaseEntity>;
}

/**
 * Build the queued-generation stub entity for a prompt-based create.
 *
 * The adapter's `buildStub` provides domain content and metadata; central
 * code only stamps id, timestamps, and visibility (see the `buildStub`
 * contract on `EntityAdapter`). Returns undefined when the entity type does
 * not support prompt-based queued creation.
 */
export function buildGenerationStubEntity(
  entityRegistry: GenerationStubAdapterLookup,
  input: { entityType: string; id: string; title: string },
): BaseEntity | undefined {
  const adapter = entityRegistry.getAdapter(input.entityType);
  if (!adapter.buildStub) return undefined;

  const stub = adapter.buildStub({ id: input.id, title: input.title });
  const now = new Date().toISOString();
  return {
    id: input.id,
    entityType: input.entityType,
    content: stub.content,
    metadata: stub.metadata,
    visibility: "public",
    created: now,
    updated: now,
    contentHash: "",
  };
}

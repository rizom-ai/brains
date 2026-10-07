import { defineDataSource } from "@rizom/brain/entities";

export const contextSource = defineDataSource({
  id: "context-canary",
  name: "Context canary",
  description: "Read-only presentation metadata",
  fetch: async (_query, entities, context) => {
    const publishedOnly: boolean | undefined = context.publishedOnly;
    function unsupported(): void {
      // @ts-expect-error Build metadata is immutable, not an authority setter.
      context.publishedOnly = false;
      // @ts-expect-error No raw service is exposed alongside metadata.
      void context.entityService;
      // @ts-expect-error Read-only sources do not acquire write authority.
      void entities.upsertEntity;
    }
    void unsupported;
    return { publishedOnly: publishedOnly ?? null };
  },
});

import {
  defineDataSource,
  type SharedStateReader,
} from "@rizom/brain/entities";
import { digestCount } from "@fixture/reading-insights";
import { z } from "@rizom/site";

// Compile-only: checked by the fixture typecheck, never loaded by the brain.
export const readsOnly = defineDataSource({
  id: "reads-only",
  name: "Reads only",
  description: "Compile-only rejection",
  fetch: async (_query, _entities, context) => {
    const digests: SharedStateReader<{ count: number }> =
      context.sharedState(digestCount);
    function unsupported(): void {
      // @ts-expect-error A shared record is read, never written.
      void digests.set;
      // @ts-expect-error Only a record its owner declared shared is readable.
      context.sharedState({ namespace: "digests", schema: z.object({}) });
    }
    void unsupported;
    return { counted: (await digests.get("total"))?.count ?? 0 };
  },
});

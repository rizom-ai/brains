import type { IEntityService } from "@brains/entity-service";
import { createEntityReader } from "../entity/entity-reader";
import type { MediaAttachmentContext } from "../entity/entity-definition-contract";
import { withEntityRuntime } from "../entity/entity-runtime";
import { createScopedAssetReads } from "../entity/owned-entity-writer-runtime";

/**
 * A media attachment context a test builds, given the runtime the brain
 * gives a real one: public reads, and the bytes of an asset-backed record
 * read through one visible at that scope.
 */
export function withMediaAssetReads<TContext extends MediaAttachmentContext>(
  context: TContext,
  entityService: Pick<
    IEntityService,
    | "getEntityRaw"
    | "listEntities"
    | "countEntities"
    | "openAsset"
    | "readAsset"
  >,
): Readonly<TContext> {
  const where = "a test media attachment";
  const reader = createEntityReader(entityService, "public");
  return withEntityRuntime(
    { ...context },
    {
      where,
      reader,
      packageReader: reader,
      ownsType: () => false,
      searchWithDistances: async (): Promise<never> => {
        throw new Error(`searchWithDistances is not available in ${where}`);
      },
      generateObject: async (): Promise<never> => {
        throw new Error(`generateObject is not available in ${where}`);
      },
      assets: createScopedAssetReads(entityService, "public", where),
    },
  );
}

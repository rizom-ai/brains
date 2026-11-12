import {
  defineEntity,
  defineEntityPackage,
  defineServicePlugin,
  type EntityDefinition,
  type EntityPackageDefinition,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";

const shelfMetadata: z.ZodObject<{ title: z.ZodString }> = z.object({
  title: z.string(),
});

/** A declarative entity package as an entity package's entry exports it. */
const shelf: EntityDefinition<"shelf", typeof shelfMetadata> = defineEntity({
  type: "shelf",
  purpose: "A shelf of books.",
  metadata: shelfMetadata,
});

const shelfPackage: EntityPackageDefinition<
  readonly [typeof shelf],
  readonly []
> = defineEntityPackage({ id: "shelf", entities: [shelf] });

export default shelfPackage;

/**
 * A declarative service package keeping its class's id, which its one type
 * has too, as a service converted from an entity plugin class exports it.
 */
export const shelvingPackage: ReturnType<typeof defineServicePlugin> =
  defineServicePlugin({
    id: "shelving",
    config: z.object({}),
    entities: [shelf],
  });

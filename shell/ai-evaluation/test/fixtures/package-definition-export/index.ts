import {
  defineEntity,
  defineEntityPackage,
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

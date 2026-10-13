import type { IEntitiesNamespace } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { ContactStorageSlots } from "./storage-slots";

export const CONTACT_WRITE_ADMISSION: string = "contact:intake";

/** Resolve the live slot on the owner, at the entity transaction boundary. */
export function registerContactWriteAdmission(
  entities: Pick<IEntitiesNamespace, "registerWriteAdmission">,
  slots: Pick<ContactStorageSlots, "assertWritable">,
): () => void {
  return entities.registerWriteAdmission(
    CONTACT_WRITE_ADMISSION,
    z.strictObject({ id: z.string().min(1) }),
    async ({ entity, operation, signal }, payload): Promise<void> => {
      if (
        operation !== "create" ||
        entity.entityType !== "contact-request" ||
        entity.id !== payload.id ||
        entity.visibility !== "restricted"
      ) {
        throw new Error("Contact write unavailable");
      }
      signal?.throwIfAborted();
      await slots.assertWritable(entity.id);
      signal?.throwIfAborted();
    },
  );
}

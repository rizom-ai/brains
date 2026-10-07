import { z } from "@brains/utils/zod";
import { sha256Hex } from "@brains/utils/hash";
import type { IRuntimeStateNamespace } from "@brains/runtime-state";
import {
  interfaceAvailabilitySchema,
  type InterfaceAvailabilityOwner,
  type InterfaceAvailabilityReader,
  type InterfaceAvailabilityWriter,
} from "@brains/contracts";
import { operatorRead } from "../service/operator-validation";

const ownerSchema = z.strictObject({
  packageName: z
    .string()
    .min(1)
    .max(200)
    .refine((value) => Buffer.from(value).toString("utf8") === value),
  declarationId: z
    .string()
    .min(1)
    .max(100)
    .refine((value) => Buffer.from(value).toString("utf8") === value),
});
/** Separate storage domain from private package/interface bookkeeping.
 * Only the runtime chooses a writer's owner; a reader cannot obtain a store. */
function scope(owner: InterfaceAvailabilityOwner): string {
  const parsed = ownerSchema.parse(owner);
  return `public-interface-availability:v1:${sha256Hex(JSON.stringify([parsed.packageName, parsed.declarationId]))}`;
}
export function createInterfaceAvailabilityWriter(
  source: IRuntimeStateNamespace,
  owner: InterfaceAvailabilityOwner,
): InterfaceAvailabilityWriter {
  const boundOwner = Object.freeze({
    packageName: owner.packageName,
    declarationId: owner.declarationId,
  });
  return Object.freeze({
    set: (value) =>
      operatorRead(async () => {
        const parsed = interfaceAvailabilitySchema.parse(value);
        await source
          .scoped({
            namespace: scope(boundOwner),
            schema: interfaceAvailabilitySchema,
          })
          .set("availability", parsed);
      }),
  } satisfies InterfaceAvailabilityWriter);
}
export function createInterfaceAvailabilityReader(
  source: IRuntimeStateNamespace,
): InterfaceAvailabilityReader {
  return Object.freeze({
    get: async (owner): ReturnType<InterfaceAvailabilityReader["get"]> => {
      try {
        const value = await source
          .scoped({
            namespace: scope(owner),
            schema: interfaceAvailabilitySchema,
          })
          .get("availability");
        return value === null
          ? null
          : Object.freeze(interfaceAvailabilitySchema.parse(value));
      } catch {
        // Public presentation cannot expose storage details or establish readiness.
        return null;
      }
    },
  } satisfies InterfaceAvailabilityReader);
}

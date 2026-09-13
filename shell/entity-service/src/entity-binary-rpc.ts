import { z } from "@brains/utils/zod";
import {
  binaryUploadSizeSchema,
  binaryUploadTicketSchema,
  binaryUploadOfferSchema,
  binaryUploadReceiptSchema,
  binaryUploadEndpointSchema,
  type BinaryPersistence,
  type BinaryRequestContext,
} from "@brains/db/binary-publication";
import type { EntityService } from "./entityService";
import { createOwnedAssetPublication } from "./binary-asset-publication";
import { createEntityPublicationRpcHandler } from "./entity-rpc";

export const ENTITY_BINARY_CONTROL_SERVICE = "entity-binary-control";
export const ENTITY_PUBLICATION_SERVICE = "entity-publication";
const controlSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    operation: z.literal("offer"),
    size: binaryUploadSizeSchema,
  }),
  z.strictObject({
    operation: z.literal("upload"),
    ticket: binaryUploadTicketSchema,
  }),
  z.strictObject({
    operation: z.literal("endpoint"),
    ticket: binaryUploadTicketSchema,
  }),
  z.strictObject({
    operation: z.literal("cancel"),
    ticket: binaryUploadTicketSchema,
  }),
]);
export interface EntityBinaryRpcHandlers {
  control(
    input: unknown,
    signal: AbortSignal,
    connectionSignal: AbortSignal,
  ): Promise<unknown>;
  publication(
    input: unknown,
    signal: AbortSignal,
    connectionSignal: AbortSignal,
  ): Promise<unknown>;
}
/** Registered only for the database's actual binary owner, never a byte fallback. */
export function createEntityBinaryRpcHandlers(
  service: EntityService,
  binary: BinaryPersistence,
): EntityBinaryRpcHandlers {
  return {
    control: async (input, signal, connectionSignal): Promise<unknown> => {
      signal.throwIfAborted();
      connectionSignal.throwIfAborted();
      const request = controlSchema.parse(input);
      const context: BinaryRequestContext = { signal, connectionSignal };
      switch (request.operation) {
        case "offer":
          return binaryUploadOfferSchema.parse(
            await binary.offer(context, request.size),
          );
        case "upload":
          return binaryUploadReceiptSchema.parse(
            await binary.upload(context, request.ticket),
          );
        case "endpoint":
          return binaryUploadEndpointSchema.parse(
            await binary.endpoint(context, request.ticket),
          );
        case "cancel":
          await binary.cancel(context, request.ticket);
          return null;
      }
    },
    publication: createEntityPublicationRpcHandler(service, {
      consumeClaim: (context, ticket, operation) =>
        binary.consume(context, ticket, (publication) =>
          operation(createOwnedAssetPublication(publication)),
        ),
    }),
  };
}

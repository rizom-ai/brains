import { z } from "@brains/utils/zod";
import { assetRefSchema, type AssetRef } from "@brains/assets";
import {
  binaryReadOfferSchema,
  binaryReadEndpointSchema,
  binaryReadFactsSchema,
} from "@brains/db/binary-read";
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
import {
  createEntityPublicationRpcHandler,
  parseEntityPublicationRpcRequest,
  type EntityPublicationRpcRequest,
} from "./entity-rpc";
import { ProjectionBatchScopeSchema } from "./projection-rpc";
import type { ProjectionBatchScope } from "./projection-store";

export const ENTITY_BINARY_CONTROL_SERVICE = "entity-binary-control";
export const ENTITY_PUBLICATION_SERVICE = "entity-publication";
const controlSchema: z.ZodType<EntityBinaryControlRequest, unknown> =
  z.discriminatedUnion("operation", [
    z.strictObject({ operation: z.literal("offerRead"), ref: assetRefSchema }),
    z.strictObject({
      operation: z.literal("download"),
      ticket: binaryUploadTicketSchema,
    }),
    z.strictObject({
      operation: z.literal("readEndpoint"),
      ticket: binaryUploadTicketSchema,
    }),
    z.strictObject({
      operation: z.literal("cancelRead"),
      ticket: binaryUploadTicketSchema,
    }),
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
export type EntityBinaryControlRequest =
  | { operation: "offer"; size: number }
  | { operation: "offerRead"; ref: AssetRef }
  | {
      operation:
        | "upload"
        | "endpoint"
        | "cancel"
        | "download"
        | "readEndpoint"
        | "cancelRead";
      ticket: string;
    };
export function parseEntityBinaryControlRequest(
  input: unknown,
): EntityBinaryControlRequest {
  return controlSchema.parse(input);
}
const publicationCallSchema = z.strictObject({
  request: z.unknown(),
  batchScope: ProjectionBatchScopeSchema.optional(),
});
export interface EntityBinaryPublicationCall {
  request: EntityPublicationRpcRequest;
  batchScope?: ProjectionBatchScope | undefined;
}
export function parseEntityBinaryPublicationCall(
  input: unknown,
): EntityBinaryPublicationCall {
  const call = publicationCallSchema.parse(input);
  return {
    request: parseEntityPublicationRpcRequest(call.request),
    ...(call.batchScope !== undefined && { batchScope: call.batchScope }),
  };
}

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
  const publish = createEntityPublicationRpcHandler(service, {
    consumeClaim: (context, ticket, operation) =>
      binary.consume(context, ticket, (publication) =>
        operation(createOwnedAssetPublication(publication)),
      ),
  });
  return {
    control: async (input, signal, connectionSignal): Promise<unknown> => {
      signal.throwIfAborted();
      connectionSignal.throwIfAborted();
      const request = controlSchema.parse(input);
      const context: BinaryRequestContext = { signal, connectionSignal };
      switch (request.operation) {
        case "offerRead":
          return binaryReadOfferSchema.parse(
            await service.offerAssetRead(context, request.ref),
          );
        case "download":
          return binaryReadFactsSchema.parse(
            await binary.reads.download(context, request.ticket),
          );
        case "readEndpoint":
          return binaryReadEndpointSchema.parse(
            await binary.reads.endpoint(context, request.ticket),
          );
        case "cancelRead":
          await binary.reads.cancel(context, request.ticket);
          return null;
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
    publication: async (input, signal, connectionSignal): Promise<unknown> => {
      signal.throwIfAborted();
      connectionSignal.throwIfAborted();
      const call = parseEntityBinaryPublicationCall(input);
      const dispatch = (): Promise<unknown> =>
        publish(call.request, signal, connectionSignal);
      return call.batchScope
        ? service
            .getProjectionStore()
            .runInBatchScope(call.batchScope, dispatch)
        : dispatch();
    },
  };
}

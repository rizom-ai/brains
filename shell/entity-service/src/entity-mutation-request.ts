import { entityMutationReceiptKeySchema } from "./entity-mutation-receipt";
import type {
  ApplyEntityMutationOnceRequest,
  BaseEntity,
  CreateEntityRequest,
  UpdateEntityRequest,
} from "./types";

function detachWriteRequest<
  T extends CreateEntityRequest<BaseEntity> | UpdateEntityRequest<BaseEntity>,
>(request: T): T {
  return {
    ...request,
    entity: structuredClone(request.entity),
    ...(request.options && {
      options: {
        ...request.options,
        ...(request.options.conditionalWrite && {
          conditionalWrite: { ...request.options.conditionalWrite },
        }),
        ...(request.options.eventContext && {
          eventContext: structuredClone(request.options.eventContext),
        }),
      },
    }),
  };
}

/** Snapshot identities, guards, attribution and metadata before yielding. */
export function snapshotEntityMutation(
  input: ApplyEntityMutationOnceRequest,
): ApplyEntityMutationOnceRequest {
  const receipt = entityMutationReceiptKeySchema.parse(input.receipt);
  switch (input.operation) {
    case "none":
      return { operation: "none", receipt };
    case "create":
      return {
        operation: "create",
        receipt,
        request: detachWriteRequest(input.request),
      };
    case "update":
      return {
        operation: "update",
        receipt,
        request: detachWriteRequest(input.request),
      };
    default:
      throw new Error("Invalid once-only entity operation");
  }
}

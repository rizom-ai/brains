import type { z } from "@brains/utils/zod";

/**
 * The client half of a local-database RPC service.
 *
 * Every worker-side facade speaks this: it sends a validated request payload
 * to the process that owns the database files and gets an unvalidated reply
 * back. The payload type is the only thing that varies between services, so
 * it is the single parameter here rather than a per-service copy.
 */
export interface LocalDatabaseTransport<TPayload> {
  initialize(): Promise<void>;
  request(
    payload: TPayload,
    options?: { signal?: AbortSignal | undefined },
  ): Promise<unknown>;
  close(): void;
}

/**
 * One result schema per operation, checked against the service's declared
 * results. Declaring the map with this type is what stops the schemas and the
 * result types from drifting apart.
 */
export type RpcResultSchemas<TResults> = {
  [Op in keyof TResults]: z.ZodType<TResults[Op], unknown>;
};

/**
 * Parse a reply as the operation's own result type.
 *
 * The operation is the discriminant, so keying the schemas by it lets the
 * returned parser answer with `TResults[Op]` — the caller does not re-assert
 * the type it expects, and an annotation that disagrees fails to compile.
 */
export type RpcResultParser<TResults> = <Op extends keyof TResults>(
  request: { operation: Op },
  input: unknown,
) => TResults[Op];

export function createRpcResultParser<TResults>(
  schemas: RpcResultSchemas<TResults>,
): RpcResultParser<TResults> {
  return (request, input) => schemas[request.operation].parse(input);
}

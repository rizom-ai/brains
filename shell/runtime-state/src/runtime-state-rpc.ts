import { z } from "@brains/utils/zod";
import type { IRuntimeStateService, RuntimeStateRecordValue } from "./types";

export const RUNTIME_STATE_RPC_SERVICE = "runtime-state";

export interface RuntimeStateRpcTransport {
  initialize(): Promise<void>;
  request(
    payload: RuntimeStateRpcRequest,
    options?: { signal?: AbortSignal | undefined },
  ): Promise<unknown>;
  close(): void;
}

export type RuntimeStateRpcRequest =
  | { operation: "get"; namespace: string; key: string }
  | { operation: "has"; namespace: string; key: string }
  | { operation: "set"; namespace: string; key: string; value: unknown }
  | {
      operation: "setIfNotExists";
      namespace: string;
      key: string;
      value: unknown;
    }
  | { operation: "delete"; namespace: string; key: string }
  | {
      operation: "list";
      namespace: string;
      keyPrefix?: string | undefined;
    }
  | {
      operation: "clear";
      namespace: string;
      keyPrefix?: string | undefined;
    };

export interface RuntimeStateRpcRecord {
  key: string;
  value: unknown;
  createdAt: number;
  updatedAt: number;
}

const namespaceSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/);
const keySchema = z.string().min(1).max(512);
const keyPrefixSchema = z.string().max(512);
const requestBaseSchema = { namespace: namespaceSchema };

export const RuntimeStateRpcRequestSchema: z.ZodType<
  RuntimeStateRpcRequest,
  unknown
> = z.discriminatedUnion("operation", [
  z.strictObject({
    operation: z.literal("get"),
    ...requestBaseSchema,
    key: keySchema,
  }),
  z.strictObject({
    operation: z.literal("has"),
    ...requestBaseSchema,
    key: keySchema,
  }),
  z.strictObject({
    operation: z.literal("set"),
    ...requestBaseSchema,
    key: keySchema,
    value: z.unknown(),
  }),
  z.strictObject({
    operation: z.literal("setIfNotExists"),
    ...requestBaseSchema,
    key: keySchema,
    value: z.unknown(),
  }),
  z.strictObject({
    operation: z.literal("delete"),
    ...requestBaseSchema,
    key: keySchema,
  }),
  z.strictObject({
    operation: z.literal("list"),
    ...requestBaseSchema,
    keyPrefix: keyPrefixSchema.optional(),
  }),
  z.strictObject({
    operation: z.literal("clear"),
    ...requestBaseSchema,
    keyPrefix: keyPrefixSchema.optional(),
  }),
]);

const recordSchema: z.ZodType<RuntimeStateRpcRecord, unknown> = z.strictObject({
  key: z.string().min(1),
  value: z.unknown(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export function parseRuntimeStateRpcRequest(
  input: unknown,
): RuntimeStateRpcRequest {
  return RuntimeStateRpcRequestSchema.parse(input);
}

/**
 * What each operation answers. The schema map below is checked against this,
 * so the two cannot drift, and keying both by operation is what lets
 * `parseRuntimeStateRpcResult` return the operation's own type — callers no
 * longer re-assert it at the transport boundary.
 */
export interface RuntimeStateRpcResults {
  get: unknown;
  has: boolean;
  set: undefined;
  setIfNotExists: boolean;
  delete: boolean;
  list: RuntimeStateRpcRecord[];
  clear: number;
}

export type RuntimeStateRpcOperation = keyof RuntimeStateRpcResults;

const resultSchemas: {
  [Op in RuntimeStateRpcOperation]: z.ZodType<
    RuntimeStateRpcResults[Op],
    unknown
  >;
} = {
  get: z.unknown(),
  has: z.boolean(),
  set: z.undefined(),
  setIfNotExists: z.boolean(),
  delete: z.boolean(),
  list: z.array(recordSchema),
  clear: z.number().int().nonnegative(),
};

export function parseRuntimeStateRpcResult<Op extends RuntimeStateRpcOperation>(
  request: { operation: Op },
  input: unknown,
): RuntimeStateRpcResults[Op] {
  return resultSchemas[request.operation].parse(input);
}

/** Dispatch one validated request against the web-owned runtime-state service. */
export async function handleRuntimeStateRpcRequest(
  service: IRuntimeStateService,
  input: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  signal?.throwIfAborted();
  const request = parseRuntimeStateRpcRequest(input);
  const store = service.scoped({
    namespace: request.namespace,
    schema: z.unknown(),
  });

  switch (request.operation) {
    case "get":
      return store.get(request.key);
    case "has":
      return store.has(request.key);
    case "set":
      return store.set(request.key, request.value);
    case "setIfNotExists":
      return store.setIfNotExists(request.key, request.value);
    case "delete":
      return store.delete(request.key);
    case "list": {
      const records: RuntimeStateRecordValue<unknown>[] = await store.list(
        request.keyPrefix === undefined
          ? undefined
          : { keyPrefix: request.keyPrefix },
      );
      return records.map((record): RuntimeStateRpcRecord => ({
        key: record.key,
        value: record.value,
        createdAt: record.createdAt.getTime(),
        updatedAt: record.updatedAt.getTime(),
      }));
    }
    case "clear":
      return store.clear(
        request.keyPrefix === undefined
          ? undefined
          : { keyPrefix: request.keyPrefix },
      );
  }
}

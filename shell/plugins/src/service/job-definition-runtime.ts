import type { EnqueueJobRequest } from "@brains/job-queue";
import type { AnyServiceJobDefinition } from "./service-definition-contract";

interface RuntimeJobDefinition {
  readonly name: string;
}

const runtimeTypes = new WeakMap<object, string>();
// The same package definition may be installed in independent brain instances.
const bindingCounts = new WeakMap<object, number>();
const definitions = new WeakMap<object, AnyServiceJobDefinition>();
const resultReaders = new WeakMap<object, (result: unknown) => unknown>();

/** Every caller uses the registered definition's validation and queue policy. */
export function createServiceJobRequest(
  definition: RuntimeJobDefinition,
  input: unknown,
  source: string,
): EnqueueJobRequest {
  const type = getServiceJobRuntimeType(definition);
  const registered = definitions.get(definition);
  if (!registered)
    throw new Error(`Job "${definition.name}" has no registered definition`);
  const serialized = JSON.stringify(input);
  if (!serialized)
    throw new Error(`Job "${definition.name}" input must be JSON-serializable`);
  const wireInput: unknown = JSON.parse(serialized);
  const parsed = registered.input.parse(wireInput);
  const pendingKey = registered.oncePending?.(parsed);
  return {
    type,
    // Persist the wire input. Each worker attempt parses it at its boundary.
    data: wireInput,
    options: {
      source,
      metadata: { operationType: "data_processing", pluginId: source },
      ...(registered.retry
        ? { maxRetries: registered.retry.attempts - 1 }
        : {}),
      ...(pendingKey !== undefined
        ? { deduplication: "skip", deduplicationKey: pendingKey }
        : {}),
    },
  };
}

export function registerServiceJobResultReader(
  handler: object,
  definition: AnyServiceJobDefinition,
): void {
  resultReaders.set(handler, (result) => definition.output.parse(result));
}

/** A single-attempt harness reads results just as jobs.status reads storage. */
export function readServiceJobResult(
  handler: object,
  result: unknown,
): unknown {
  const read = resultReaders.get(handler);
  return read ? read(result) : result;
}

export function bindServiceJobRuntimeType(
  definition: AnyServiceJobDefinition,
  runtimeType: string,
): void {
  const existing = runtimeTypes.get(definition);
  if (existing && existing !== runtimeType) {
    throw new Error(
      `Job "${definition.name}" is registered as both "${existing}" and "${runtimeType}"`,
    );
  }
  runtimeTypes.set(definition, runtimeType);
  bindingCounts.set(definition, (bindingCounts.get(definition) ?? 0) + 1);
  definitions.set(definition, definition);
}

export function unbindServiceJobRuntimeType(
  definition: RuntimeJobDefinition,
  runtimeType: string,
): void {
  if (runtimeTypes.get(definition) === runtimeType) {
    const count = bindingCounts.get(definition) ?? 0;
    if (count > 1) {
      bindingCounts.set(definition, count - 1);
      return;
    }
    bindingCounts.delete(definition);
    runtimeTypes.delete(definition);
    definitions.delete(definition);
  }
}

export function getServiceJobRuntimeType(
  definition: RuntimeJobDefinition,
): string {
  const runtimeType = runtimeTypes.get(definition);
  if (!runtimeType) {
    throw new Error(
      `Job "${definition.name}" is not registered by an active declarative service`,
    );
  }
  return runtimeType;
}

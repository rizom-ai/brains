import { Logger } from "@brains/utils/logger";
import type {
  IRuntimeStateService,
  IRuntimeStateStore,
  RuntimeStateRecordValue,
  RuntimeStateScopeOptions,
  RuntimeStateValueSchema,
} from "./types";
import {
  parseRuntimeStateRpcResult,
  type RuntimeStateRpcRecord,
  type RuntimeStateRpcRequest,
  type RuntimeStateRpcTransport,
} from "./runtime-state-rpc";
import {
  assertValidRuntimeStateNamespace,
  normalizeRuntimeStateKey,
  normalizeRuntimeStateKeyPrefix,
} from "./runtime-state-validation";

export class RemoteRuntimeStateService implements IRuntimeStateService {
  private readonly transport: RuntimeStateRpcTransport;
  private readonly logger: Logger;
  private initialization: Promise<void> | undefined;
  private closeRequested = false;

  public constructor(transport: RuntimeStateRpcTransport, logger?: Logger) {
    this.transport = transport;
    this.logger = (logger ?? Logger.getInstance()).child(
      "RemoteRuntimeStateService",
    );
  }

  public initialize(): Promise<void> {
    if (this.closeRequested) return Promise.resolve();
    this.initialization ??= this.initializeTransport();
    return this.initialization;
  }

  private async initializeTransport(): Promise<void> {
    try {
      await this.transport.initialize();
    } catch (error) {
      this.logger.warn(
        "Failed to initialize remote runtime state storage (non-fatal)",
        error,
      );
    }
  }

  public scoped<T>(
    options: RuntimeStateScopeOptions<T>,
  ): IRuntimeStateStore<T> {
    assertValidRuntimeStateNamespace(options.namespace);
    return new RemoteRuntimeStateStore(
      this.transport,
      options.namespace,
      options.schema,
      () => this.assertOpen(),
    );
  }

  public close(): void {
    if (this.closeRequested) return;
    this.closeRequested = true;
    this.transport.close();
  }

  private assertOpen(): void {
    if (this.closeRequested) {
      throw new Error("Remote runtime state service is closed");
    }
  }
}

class RemoteRuntimeStateStore<T> implements IRuntimeStateStore<T> {
  private readonly transport: RuntimeStateRpcTransport;
  private readonly namespace: string;
  private readonly schema: RuntimeStateValueSchema<T>;
  private readonly assertOpen: () => void;

  public constructor(
    transport: RuntimeStateRpcTransport,
    namespace: string,
    schema: RuntimeStateValueSchema<T>,
    assertOpen: () => void,
  ) {
    this.transport = transport;
    this.namespace = namespace;
    this.schema = schema;
    this.assertOpen = assertOpen;
  }

  private async requestRemote<R>(request: RuntimeStateRpcRequest): Promise<R> {
    this.assertOpen();
    const result = await this.transport.request(request);
    return parseRuntimeStateRpcResult(request, result) as R;
  }

  public async get(key: string): Promise<T | null> {
    const value = await this.requestRemote<unknown | null>({
      operation: "get",
      namespace: this.namespace,
      key: normalizeRuntimeStateKey(key),
    });
    return value === null ? null : this.schema.parse(value);
  }

  public has(key: string): Promise<boolean> {
    return this.requestRemote<boolean>({
      operation: "has",
      namespace: this.namespace,
      key: normalizeRuntimeStateKey(key),
    });
  }

  public async set(key: string, value: T): Promise<void> {
    await this.requestRemote<void>({
      operation: "set",
      namespace: this.namespace,
      key: normalizeRuntimeStateKey(key),
      value: this.schema.parse(value),
    });
  }

  public setIfNotExists(key: string, value: T): Promise<boolean> {
    return this.requestRemote<boolean>({
      operation: "setIfNotExists",
      namespace: this.namespace,
      key: normalizeRuntimeStateKey(key),
      value: this.schema.parse(value),
    });
  }

  public delete(key: string): Promise<boolean> {
    return this.requestRemote<boolean>({
      operation: "delete",
      namespace: this.namespace,
      key: normalizeRuntimeStateKey(key),
    });
  }

  public async list(
    options: { keyPrefix?: string | undefined } = {},
  ): Promise<RuntimeStateRecordValue<T>[]> {
    const keyPrefix = options.keyPrefix;
    if (keyPrefix !== undefined) normalizeRuntimeStateKeyPrefix(keyPrefix);
    const records = await this.requestRemote<RuntimeStateRpcRecord[]>({
      operation: "list",
      namespace: this.namespace,
      ...(keyPrefix !== undefined && { keyPrefix }),
    });
    return records.map((record) => ({
      key: record.key,
      value: this.schema.parse(record.value),
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
    }));
  }

  public clear(
    options: { keyPrefix?: string | undefined } = {},
  ): Promise<number> {
    const keyPrefix = options.keyPrefix;
    if (keyPrefix !== undefined) normalizeRuntimeStateKeyPrefix(keyPrefix);
    return this.requestRemote<number>({
      operation: "clear",
      namespace: this.namespace,
      ...(keyPrefix !== undefined && { keyPrefix }),
    });
  }
}

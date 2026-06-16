import type { Client } from "@libsql/client";
import { Logger } from "@brains/utils";
import {
  createRuntimeStateDatabase,
  enableRuntimeStateWALMode,
  type RuntimeStateDB,
} from "./db";
import { RuntimeStateStore } from "./runtime-state-store";
import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
  RuntimeStateScopeOptions,
  RuntimeStateServiceConfig,
} from "./types";

export class RuntimeStateService implements IRuntimeStateNamespace {
  private static instance: RuntimeStateService | null = null;
  private readonly db: RuntimeStateDB;
  private readonly client: Client;
  private readonly logger: Logger;

  static getInstance(
    config: RuntimeStateServiceConfig,
    logger?: Logger,
  ): RuntimeStateService {
    RuntimeStateService.instance ??= new RuntimeStateService(
      config,
      logger ?? Logger.getInstance(),
    );
    return RuntimeStateService.instance;
  }

  static createFresh(
    config: RuntimeStateServiceConfig,
    logger?: Logger,
  ): RuntimeStateService {
    return new RuntimeStateService(config, logger ?? Logger.getInstance());
  }

  static resetInstance(): void {
    RuntimeStateService.instance?.close();
    RuntimeStateService.instance = null;
  }

  private constructor(config: RuntimeStateServiceConfig, logger: Logger) {
    const { db, client, url } = createRuntimeStateDatabase(config);
    this.db = db;
    this.client = client;
    this.logger = logger.child("RuntimeStateService");

    enableRuntimeStateWALMode(client, url).catch((error) => {
      this.logger.warn(
        "Failed to enable runtime state WAL mode (non-fatal)",
        error,
      );
    });
  }

  scoped<T>(options: RuntimeStateScopeOptions<T>): IRuntimeStateStore<T> {
    return new RuntimeStateStore(this.db, options.namespace, options.schema);
  }

  close(): void {
    this.client.close();
  }
}

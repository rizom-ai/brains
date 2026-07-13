import type { Client } from "@libsql/client";
import { Logger } from "@brains/utils/logger";
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
  private readonly databaseUrl: string;
  private walInitialization: Promise<void> | null = null;
  private walInitializationSettled = false;
  private closeRequested = false;
  private clientClosed = false;

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
    this.databaseUrl = url;
    this.logger = logger.child("RuntimeStateService");
  }

  /** Settle non-fatal database readiness work before the shell becomes ready. */
  initialize(): Promise<void> {
    if (this.closeRequested) return Promise.resolve();
    this.walInitialization ??= this.initializeWALMode();
    return this.walInitialization;
  }

  private async initializeWALMode(): Promise<void> {
    try {
      await enableRuntimeStateWALMode(this.client, this.databaseUrl);
    } catch (error) {
      this.logger.warn(
        "Failed to enable runtime state WAL mode (non-fatal)",
        error,
      );
    } finally {
      this.walInitializationSettled = true;
      if (this.closeRequested) this.closeClient();
    }
  }

  scoped<T>(options: RuntimeStateScopeOptions<T>): IRuntimeStateStore<T> {
    return new RuntimeStateStore(this.db, options.namespace, options.schema);
  }

  close(): void {
    this.closeRequested = true;
    if (!this.walInitialization || this.walInitializationSettled) {
      this.closeClient();
    }
  }

  private closeClient(): void {
    if (this.clientClosed) return;
    this.clientClosed = true;
    this.client.close();
  }
}

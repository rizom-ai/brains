import type { Worker } from "node:worker_threads";
import type { SqlWorkerDriver } from "./client";
import {
  capabilitySchema,
  sealedSchema,
  type StageCapability,
  type SealedStage,
} from "./binary-protocol";
import { blobPlanSchema, type BlobPlan } from "./blob-protocol";

export class ReadScope {
  public readonly id: string;
  private readonly driver: SqlWorkerDriver;
  private closing: Promise<void> | undefined;
  public constructor(driver: SqlWorkerDriver, id: string) {
    this.driver = driver;
    this.id = id;
  }
  public async prepare(input: BlobPlan): Promise<SealedStage> {
    this.assertOpen();
    const plan = blobPlanSchema.parse(input); // Snapshot descriptors before any await.
    const capability = capabilitySchema.parse(
      await this.driver.read({ action: "allocate", scope: this.id, plan }),
    );
    try {
      this.assertOpen();
      const facts = sealedSchema.parse(
        await this.driver.read({ action: "fill", capability }),
      );
      this.assertOpen();
      return facts;
    } catch (error) {
      try {
        await this.discard(capability);
      } catch (cleanup) {
        throw new AggregateError(
          [error, cleanup],
          "Read preparation and discard failed",
          { cause: cleanup },
        );
      }
      throw error;
    }
  }
  public download(
    capability: StageCapability,
    spawn: () => Worker,
    signal?: AbortSignal,
  ): Promise<SealedStage> {
    this.assertOpen();
    if (capability.scope !== this.id)
      return Promise.reject(new Error("Foreign read scope"));
    return this.driver.download(capability, spawn, signal);
  }
  public async discard(capability: StageCapability): Promise<void> {
    if (capability.scope !== this.id) throw new Error("Foreign read scope");
    await this.driver.read({ action: "discard", capability });
  }
  public close(): Promise<void> {
    this.closing ??= this.driver
      .read({ action: "closeScope", scope: this.id })
      .then(() => undefined);
    return this.closing;
  }
  private assertOpen(): void {
    if (this.closing) throw new Error("Read scope is closing");
  }
}

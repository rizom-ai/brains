import type { TursoThreadProof } from "./client";
import {
  STAGE_CHUNK_BYTES,
  capabilitySchema,
  sealedSchema,
  claimSchema,
  type BinaryCommand,
  type StageCapability,
  type SealedStage,
  type StageClaim,
} from "./binary-protocol";

type BeginOptions = Omit<
  Extract<BinaryCommand, { action: "beginStage" }>,
  "action" | "scope"
>;

/** A local proof lifetime, not yet an authenticated application RPC scope. */
export class BinaryScope {
  private closed = false;
  private closing: Promise<void> | undefined;
  private readonly driver: TursoThreadProof;
  public readonly id: string;
  public constructor(driver: TursoThreadProof, id: string) {
    this.driver = driver;
    this.id = id;
  }

  public async begin(options: BeginOptions): Promise<StageCapability> {
    this.assertOpen();
    return capabilitySchema.parse(
      await this.driver.binary({
        action: "beginStage",
        scope: this.id,
        ...options,
      }),
    );
  }
  public async append(
    capability: StageCapability,
    offset: number,
    bytes: Uint8Array,
  ): Promise<void> {
    this.assertOpen();
    if (bytes.byteLength === 0 || bytes.byteLength > STAGE_CHUNK_BYTES)
      throw new Error("Invalid stage chunk size");
    await this.driver.binary({
      action: "append",
      scope: this.id,
      capability,
      offset,
      bytes: Uint8Array.from(bytes).buffer,
    });
  }
  public async seal(capability: StageCapability): Promise<SealedStage> {
    this.assertOpen();
    return sealedSchema.parse(
      await this.driver.binary({ action: "seal", scope: this.id, capability }),
    );
  }
  public async reserve(capability: StageCapability): Promise<StageClaim> {
    this.assertOpen();
    return claimSchema.parse(
      await this.driver.binary({
        action: "reserve",
        scope: this.id,
        capability,
      }),
    );
  }
  public async discard(capability: StageCapability): Promise<void> {
    await this.driver.binary({ action: "discard", scope: this.id, capability });
  }
  public close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    this.closing = this.driver
      .binary({ action: "closeScope", scope: this.id })
      .then(() => undefined);
    return this.closing;
  }
  private assertOpen(): void {
    if (this.closed) throw new Error("Binary scope is closed");
  }
}

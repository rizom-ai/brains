import { createHash, randomUUID, type Hash } from "node:crypto";
import { isMainThread } from "node:worker_threads";
import type { InArgs } from "@libsql/client";
import {
  STAGE_BUDGET_BYTES,
  STAGE_SLOTS,
  STAGE_CHUNK_BYTES,
  type BinaryCommand,
  type BoundStatement,
  type StageCapability,
  type StageClaim,
  type StageStats,
} from "./binary-protocol";

interface Stage {
  capability: StageCapability;
  bytes: Uint8Array;
  hash: Hash;
  received: number;
  expectedSize: number | undefined;
  expectedDigest: string | undefined;
  sha256: string | undefined;
  claimId: string | undefined;
  lease: string | undefined;
  upload: string | undefined;
}

/** Volatile storage beside the native handle. No asset schema or durable put. */
export class StagedBinaries {
  private readonly scopes = new Set<string>();
  private readonly stages = new Map<number, Stage>();
  private reservedBytes = 0;
  private closing = false;

  private readonly generation: string;
  private readonly releaseBudget: (id: number) => void;
  private readonly revokeUpload: (id: number) => void;
  public constructor(
    generation: string,
    releaseBudget: (id: number) => void,
    revokeUpload: (id: number) => void,
  ) {
    if (isMainThread)
      throw new Error("Binary staging must execute off the main thread");
    this.generation = generation;
    this.releaseBudget = releaseBudget;
    this.revokeUpload = revokeUpload;
  }

  public execute(
    command: BinaryCommand,
    requestId: number,
    upload?: string,
  ): unknown {
    switch (command.action) {
      case "openScope": {
        if (this.closing || this.scopes.size >= STAGE_SLOTS)
          throw new Error("Binary scope capacity exceeded or closing");
        const scope = randomUUID();
        this.scopes.add(scope);
        return scope;
      }
      case "closeScope":
        this.scopes.delete(command.scope);
        for (const stage of this.stages.values()) {
          if (
            stage.capability.scope === command.scope &&
            stage.claimId === undefined
          )
            this.drop(stage);
        }
        return undefined;
      case "beginStage": {
        this.assertScope(command.scope);
        if (
          command.expectedSize !== undefined &&
          command.expectedSize > command.reservationBytes
        )
          throw new Error("Expected size exceeds reservation");
        if (
          this.stages.size >= STAGE_SLOTS ||
          command.reservationBytes > STAGE_BUDGET_BYTES - this.reservedBytes
        )
          throw new Error("Binary staging capacity exceeded");
        const capability: StageCapability = {
          generation: this.generation,
          scope: command.scope,
          id: requestId,
        };
        const bytes = new Uint8Array(command.reservationBytes);
        this.stages.set(requestId, {
          capability,
          bytes,
          hash: createHash("sha256"),
          received: 0,
          expectedSize: command.expectedSize,
          expectedDigest: command.expectedDigest,
          sha256: undefined,
          claimId: undefined,
          lease: undefined,
          upload: undefined,
        });
        this.reservedBytes += bytes.byteLength;
        return capability;
      }
      case "append":
        this.appendBytes(
          command.scope,
          command.capability,
          command.offset,
          new Uint8Array(command.bytes),
          upload,
        );
        return undefined;
      case "seal": {
        this.assertScope(command.scope);
        const stage = this.get(command.capability, command.scope);
        this.assertWriter(stage, upload);
        if (stage.sha256 !== undefined)
          throw new Error("Stage is already sealed");
        const sha256 = stage.hash.digest("hex");
        if (
          (stage.expectedSize !== undefined &&
            stage.received !== stage.expectedSize) ||
          (stage.expectedDigest !== undefined &&
            sha256 !== stage.expectedDigest)
        ) {
          this.drop(stage);
          throw new Error("Stage size or digest mismatch");
        }
        stage.sha256 = sha256;
        return {
          capability: stage.capability,
          sizeBytes: stage.received,
          sha256,
        };
      }
      case "reserve": {
        this.assertScope(command.scope);
        const stage = this.get(command.capability, command.scope);
        if (
          stage.sha256 === undefined ||
          stage.claimId !== undefined ||
          stage.upload !== undefined
        )
          throw new Error("Stage is not available for a mutation");
        stage.claimId = randomUUID();
        return { ...stage.capability, claimId: stage.claimId };
      }
      case "discard": {
        this.assertCapability(command.capability, command.scope);
        if (!this.stages.has(command.capability.id)) return undefined;
        const stage = this.get(command.capability, command.scope);
        if (stage.claimId !== undefined)
          throw new Error("Claimed stage cannot be discarded");
        this.drop(stage);
        return undefined;
      }
      case "releaseClaim": {
        this.assertCapability(command.claim, command.claim.scope);
        if (!this.stages.has(command.claim.id)) return undefined;
        const stage = this.getClaim(command.claim);
        if (stage.lease !== undefined)
          throw new Error("Claim is attached to a transaction");
        this.drop(stage);
        return undefined;
      }
      case "stats":
        return this.stats();
    }
  }

  public openUpload(capability: StageCapability, id: string): void {
    this.assertScope(capability.scope);
    const stage = this.get(capability, capability.scope);
    if (
      stage.upload !== undefined ||
      stage.received !== 0 ||
      stage.sha256 !== undefined ||
      stage.claimId !== undefined
    )
      throw new Error("Stage is not available for a direct upload");
    stage.upload = id;
  }
  public finishUpload(capability: StageCapability, id: string): boolean {
    const stage = this.stages.get(capability.id);
    if (stage?.upload !== id) return false;
    stage.upload = undefined;
    return true;
  }
  public appendBytes(
    scope: string,
    capability: StageCapability,
    offset: number,
    bytes: Uint8Array,
    upload?: string,
  ): void {
    this.assertScope(scope);
    const stage = this.get(capability, scope);
    this.assertWriter(stage, upload);
    if (stage.sha256 !== undefined) throw new Error("Stage is already sealed");
    if (
      offset !== stage.received ||
      bytes.byteLength < 1 ||
      bytes.byteLength > STAGE_CHUNK_BYTES ||
      bytes.byteLength > stage.bytes.byteLength - stage.received
    ) {
      this.drop(stage);
      throw new Error("Invalid stage chunk order or size");
    }
    stage.bytes.set(bytes, stage.received);
    stage.hash.update(bytes);
    stage.received += bytes.byteLength;
  }
  private assertWriter(stage: Stage, upload?: string): void {
    if (stage.upload !== upload)
      throw new Error("Stage has a different active upload channel");
  }

  /** Pin all claims synchronously BEFORE waiting for the native transaction. */
  public attach(lease: string, claims: StageClaim[]): void {
    if (this.closing) throw new Error("Binary staging is closing");
    const stages = claims.map((claim) => this.getClaim(claim));
    if (
      new Set(stages).size !== stages.length ||
      stages.some((stage) => stage.lease !== undefined)
    )
      throw new Error("Claim is already attached to a transaction");
    for (const stage of stages) stage.lease = lease;
  }

  public arguments(lease: string, statement: BoundStatement): InArgs {
    let bindBytes = 0;
    return statement.args.map((arg) => {
      if (arg.kind === "scalar") return arg.value;
      const stage = this.getClaim(arg.claim);
      if (stage.lease !== lease)
        throw new Error("Resident binding belongs to another transaction");
      bindBytes += stage.received;
      if (bindBytes > STAGE_BUDGET_BYTES)
        throw new Error("Resident statement bind budget exceeded");
      return stage.bytes.subarray(0, stage.received);
    });
  }

  public finishLease(lease: string): void {
    for (const stage of this.stages.values())
      if (stage.lease === lease) this.drop(stage);
  }
  public closeAdmission(): void {
    this.closing = true;
    this.scopes.clear();
    // Queued/admitted transaction claims remain pinned through native close.
    for (const stage of this.stages.values())
      if (stage.lease === undefined) this.drop(stage);
  }
  private stats(): StageStats {
    const stages = [...this.stages.values()];
    return {
      reservedBytes: this.reservedBytes,
      stages: stages.length,
      scopes: this.scopes.size,
      claims: stages.filter((stage) => stage.claimId !== undefined).length,
      attached: stages.filter((stage) => stage.lease !== undefined).length,
    };
  }
  private assertScope(scope: string): void {
    if (this.closing || !this.scopes.has(scope))
      throw new Error("Binary scope is closed or unknown");
  }
  private assertCapability(capability: StageCapability, scope: string): void {
    if (capability.generation !== this.generation || capability.scope !== scope)
      throw new Error("Foreign binary capability");
  }
  private get(capability: StageCapability, scope: string): Stage {
    this.assertCapability(capability, scope);
    const stage = this.stages.get(capability.id);
    if (stage?.capability.scope !== scope)
      throw new Error("Unknown binary capability");
    return stage;
  }
  private getClaim(claim: StageClaim): Stage {
    const stage = this.get(claim, claim.scope);
    if (stage.claimId === undefined || stage.claimId !== claim.claimId)
      throw new Error("Invalid mutation claim");
    return stage;
  }
  private drop(stage: Stage): void {
    if (!this.stages.delete(stage.capability.id)) return;
    this.reservedBytes -= stage.bytes.byteLength;
    // Remove the full backing allocation from every alias of this Stage object
    // before advertising reusable credit to another execution worker.
    stage.bytes = new Uint8Array(0);
    this.revokeUpload(stage.capability.id);
    this.releaseBudget(stage.capability.id);
  }
}

import { isMainThread } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import {
  STAGE_BUDGET_BYTES,
  STAGE_SLOTS,
  type StageCapability,
  type SealedStage,
} from "./binary-protocol";
import type { BlobPlan, BlobFacts } from "./blob-protocol";
import type { ReadCommand, ReadStats } from "./read-protocol";
import type { ExecutionOwner } from "./ownership";

interface ReadAllocation {
  capability: StageCapability;
  plan: BlobPlan;
  bytes: Uint8Array | undefined;
  facts: BlobFacts | undefined;
  preparing: boolean;
  revoked: boolean;
  streaming: boolean;
}
/** Whole read backing is admitted before acquiring any snapshot. No network wait
 * occurs under a database lease; data ports can only claim completed reads. */
export class ReadSnapshots {
  private readonly generation: string;
  private readonly materialization: "adopt" | "incremental";
  private readonly release: (id: number) => void;
  private readonly revokeStream: (id: number) => void;
  private readonly scopes = new Set<string>();
  private readonly reads = new Map<number, ReadAllocation>();
  private bytes = 0;
  private closing = false;
  public constructor(
    generation: string,
    release: (id: number) => void,
    revokeStream: (id: number) => void,
    materialization: "adopt" | "incremental",
  ) {
    if (isMainThread)
      throw new Error("Read snapshots require an execution worker");
    this.generation = generation;
    this.materialization = materialization;
    this.release = release;
    this.revokeStream = revokeStream;
  }
  public control(
    command: Exclude<ReadCommand, { action: "fill" }>,
    id: number,
  ): unknown {
    switch (command.action) {
      case "openScope": {
        if (this.closing || this.scopes.size >= STAGE_SLOTS)
          throw new Error("Read scope capacity exceeded or closing");
        const scope = randomUUID();
        this.scopes.add(scope);
        return scope;
      }
      case "closeScope":
        this.scopes.delete(command.scope);
        for (const read of this.reads.values())
          if (read.capability.scope === command.scope) this.revoke(read);
        return undefined;
      case "allocate": {
        if (this.closing || !this.scopes.has(command.scope))
          throw new Error("Read scope is closed or unknown");
        if (
          this.reads.size >= STAGE_SLOTS ||
          command.plan.maxBytes > STAGE_BUDGET_BYTES - this.bytes
        )
          throw new Error("Read snapshot capacity exceeded");
        const capability = {
          generation: this.generation,
          scope: command.scope,
          id,
        };
        const bytes =
          this.materialization === "incremental"
            ? new Uint8Array(command.plan.maxBytes)
            : undefined;
        this.reads.set(id, {
          capability,
          plan: command.plan,
          bytes,
          facts: undefined,
          preparing: false,
          revoked: false,
          streaming: false,
        });
        this.bytes += command.plan.maxBytes; // Reserve before fetching, even when no backing exists yet.
        return capability;
      }
      case "discard": {
        this.affinity(command.capability);
        const read = this.reads.get(command.capability.id);
        if (read) {
          this.get(command.capability);
          this.revoke(read);
        }
        return undefined;
      }
      case "stats":
        return this.stats();
    }
  }
  public async fill(
    capability: StageCapability,
    owner: ExecutionOwner,
  ): Promise<SealedStage> {
    const read = this.get(capability);
    if (read.preparing || read.facts || read.streaming)
      throw new Error("Read snapshot is already preparing or ready");
    read.preparing = true; // Pin before waiting for the native owner gate.
    let completed = false;
    // Opt-in fixture diagnostics: fixed byte checkpoints on the native thread,
    // never a timer, payload forwarding, or an assertion about scan speed.
    const trace = process.env["PROOF_READ_PROGRESS"] === "1";
    const checkpoint = 16 * 1024 * 1024;
    let nextCheckpoint = 0;
    if (trace)
      console.error(
        `[native-read] waiting for snapshot lease (${read.plan.maxBytes} reserved bytes; ${this.materialization})`,
      );
    try {
      const lease = await owner.transaction("read");
      if (trace) console.error("[native-read] snapshot lease acquired");
      let facts: BlobFacts;
      try {
        this.live(read);
        if (this.materialization === "adopt") {
          facts = await lease.adoptBlob(
            read.plan,
            (bytes) => {
              this.live(read);
              read.bytes = bytes;
              if (trace)
                console.error(
                  `[native-read] adopted ${bytes.buffer.byteLength} backing bytes without a full copy`,
                );
            },
            () => this.live(read),
          );
        } else
          facts = await lease.verifyBlob(read.plan, (bytes, offset) => {
            this.live(read);
            if (!read.bytes)
              throw new Error("Incremental read backing is unavailable");
            read.bytes.set(bytes, offset);
            const copied = offset + bytes.byteLength;
            if (
              trace &&
              (copied >= nextCheckpoint || copied === read.bytes.byteLength)
            ) {
              console.error(`[native-read] copied ${copied} bytes`);
              nextCheckpoint =
                (Math.floor(copied / checkpoint) + 1) * checkpoint;
            }
          });
        this.live(read);
      } catch (error) {
        try {
          await lease.rollback();
        } catch (cleanup) {
          throw new AggregateError(
            [error, cleanup],
            "Read materialization and snapshot release failed",
            { cause: cleanup },
          );
        }
        throw error;
      }
      if (trace)
        console.error(
          "[native-read] scan complete; awaiting rollback acknowledgement",
        );
      await lease.rollback(); // Acknowledged release BEFORE publishing the capability.
      if (trace) console.error("[native-read] rollback acknowledged");
      this.live(read);
      read.facts = facts;
      completed = true;
      return { capability: read.capability, ...facts };
    } finally {
      read.preparing = false;
      if (!completed || read.revoked) this.drop(read);
    }
  }
  public claim(capability: StageCapability): SealedStage {
    const read = this.get(capability);
    this.live(read);
    if (!read.bytes || !read.facts || read.preparing || read.streaming)
      throw new Error("Read snapshot is not available for streaming");
    read.streaming = true;
    return { capability: read.capability, ...read.facts };
  }
  public copy(
    capability: StageCapability,
    offset: number,
    destination: Uint8Array,
  ): number {
    const read = this.get(capability);
    this.live(read);
    if (
      !read.streaming ||
      !read.facts ||
      !read.bytes ||
      offset < 0 ||
      offset > read.facts.sizeBytes
    )
      throw new Error("Invalid read cursor");
    const size = Math.min(
      destination.byteLength,
      read.facts.sizeBytes - offset,
    );
    destination.set(read.bytes.subarray(offset, offset + size));
    return size;
  }
  public close(): void {
    this.closing = true;
    this.scopes.clear();
    for (const read of this.reads.values()) this.revoke(read);
  }
  public stats(): ReadStats {
    return {
      scopes: this.scopes.size,
      reads: this.reads.size,
      reservedBytes: this.bytes,
      preparing: [...this.reads.values()].filter((read) => read.preparing)
        .length,
      streaming: [...this.reads.values()].filter((read) => read.streaming)
        .length,
    };
  }
  private affinity(capability: StageCapability): void {
    if (capability.generation !== this.generation)
      throw new Error("Foreign read capability");
  }
  private get(capability: StageCapability): ReadAllocation {
    this.affinity(capability);
    const read = this.reads.get(capability.id);
    if (read?.capability.scope !== capability.scope)
      throw new Error("Unknown or spent read capability");
    return read;
  }
  private live(read: ReadAllocation): void {
    if (read.revoked || !this.scopes.has(read.capability.scope))
      throw new Error("Read scope revoked");
  }
  private revoke(read: ReadAllocation): void {
    read.revoked = true;
    this.revokeStream(read.capability.id);
    if (!read.preparing) this.drop(read);
  }
  private drop(read: ReadAllocation): void {
    if (!this.reads.delete(read.capability.id)) return;
    this.bytes -= read.plan.maxBytes;
    read.bytes = undefined;
    this.revokeStream(read.capability.id);
    this.release(read.capability.id);
  }
}

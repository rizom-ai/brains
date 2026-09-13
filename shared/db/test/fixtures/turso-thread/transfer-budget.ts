import { randomUUID } from "node:crypto";
import type { Worker } from "node:worker_threads";
import { STAGE_CHUNK_BYTES } from "./binary-protocol";

export const TRANSFER_SLOTS: number = 2;
export interface TransferReservation {
  id: string;
  bindPeer: (worker: Worker) => void;
  cancelUnstarted: () => void;
  receiverClosed: () => void;
  released: Promise<void>;
}
/** One circulating owned buffer per channel. Its last owner may be the remote
 * peer, so database-worker failure alone cannot refund it. Admit before spawning. */
export class TransferBudget {
  private readonly direction: "ingress" | "egress";
  public constructor(direction: "ingress" | "egress") {
    this.direction = direction;
  }
  private readonly active = new Map<string, Worker[]>();
  public stats(): { slots: number; reservedBytes: number } {
    return {
      slots: this.active.size,
      reservedBytes: this.active.size * STAGE_CHUNK_BYTES,
    };
  }
  public reserve(receiver: Worker): TransferReservation {
    if (receiver.threadId <= 0)
      throw new Error("Transfer requires a live execution worker");
    if (this.active.size >= TRANSFER_SLOTS)
      throw new Error(`Shared ${this.direction} capacity exceeded`);
    const id = randomUUID();
    const released = Promise.withResolvers<void>();
    this.active.set(id, [receiver]); // Keep both actors observable through uncertain cleanup.
    let receiverDone = false;
    let producerDone = false;
    let producer: Worker | undefined;
    const finish = (): void => {
      if (!receiverDone || !producerDone || !this.active.delete(id)) return;
      receiver.off("exit", receiverClosed);
      producer?.off("exit", producerExited);
      released.resolve();
    };
    const receiverClosed = (): void => {
      receiverDone = true;
      finish();
    };
    const producerExited = (): void => {
      producerDone = true;
      finish();
    };
    receiver.once("exit", receiverClosed);
    return {
      id,
      receiverClosed,
      released: released.promise,
      bindPeer: (worker): void => {
        if (
          producer ||
          producerDone ||
          receiverDone ||
          worker === receiver ||
          worker.threadId <= 0
        )
          throw new Error("Transfer requires a distinct live peer");
        producer = worker;
        this.active.get(id)?.push(worker);
        worker.once("exit", producerExited);
      },
      cancelUnstarted: (): void => {
        if (producer)
          throw new Error("Started transfer must wait for peer exit");
        producerDone = true;
        finish();
      },
    };
  }
}

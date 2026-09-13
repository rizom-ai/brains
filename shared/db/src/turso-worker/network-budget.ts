import type { Worker } from "node:worker_threads";
import { NETWORK_SCRATCH_BYTES } from "./network-wire";

/** Extra logical receive/metadata scratch, not a bound on kernel/stream/GC RSS.
 * Only an unstarted factory failure or actual bridge exit releases its slot. */
export class NetworkTransferBudget {
  private readonly direction: "ingress" | "egress";
  public constructor(direction: "ingress" | "egress") {
    this.direction = direction;
  }
  private readonly active = new Set<Worker | object>();
  public spawn(factory: () => Worker): Worker {
    if (this.active.size >= 2)
      throw new Error(`Network ${this.direction} scratch capacity exceeded`);
    const token = {};
    this.active.add(token);
    let worker: Worker;
    try {
      worker = factory();
    } catch (error) {
      this.active.delete(token);
      throw error;
    }
    if (this.active.has(worker) || worker.threadId <= 0) {
      this.active.delete(token);
      throw new Error(
        `Network ${this.direction} requires a new live bridge worker`,
      );
    }
    // A factory that throws before returning owns its own partial resources.
    // Once bound, only the actual exit listener releases this reservation.
    this.active.delete(token);
    this.active.add(worker);
    worker.once("exit", () => {
      this.active.delete(worker);
    });
    return worker;
  }
  public stats(): { slots: number; reservedBytes: number } {
    return {
      slots: this.active.size,
      reservedBytes: this.active.size * NETWORK_SCRATCH_BYTES,
    };
  }
}

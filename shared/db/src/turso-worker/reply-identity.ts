import type { SqlWorkerPlacement } from "./boot-protocol";

/** State/affinity check after wire-shape validation. Ready must identify the
 * actual spawned worker, not merely a peer claiming the expected generation.
 */
export class ReplyIdentity {
  private readonly generation: string;
  private readonly pid: number;
  private placement: SqlWorkerPlacement | undefined;
  public constructor(generation: string, pid: number) {
    this.generation = generation;
    this.pid = pid;
  }
  public accept(
    reply: SqlWorkerPlacement,
    ready: boolean,
    spawnedThreadId: number,
  ): void {
    if (
      reply.generation !== this.generation ||
      reply.pid !== this.pid ||
      (this.placement && reply.threadId !== this.placement.threadId)
    )
      throw new Error("Persistence thread identity mismatch");
    if (ready) {
      if (this.placement)
        throw new Error("Duplicate persistence thread handshake");
      if (reply.threadId !== spawnedThreadId)
        throw new Error("Handshake did not identify the spawned thread");
      // Do not borrow a ready object that initialize() exposes to callers.
      this.placement = {
        generation: reply.generation,
        pid: reply.pid,
        threadId: reply.threadId,
      };
    } else if (!this.placement)
      throw new Error("Persistence reply preceded handshake");
  }
}

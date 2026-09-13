import {
  MessageChannel,
  type MessagePort,
  type Worker,
} from "node:worker_threads";
import type { PersistenceBudgetPool } from "./budget-pool";
import type { TransferReservation } from "./transfer-budget";
import {
  capabilitySchema,
  sealedSchema,
  type StageCapability,
  type SealedStage,
} from "./binary-protocol";
import { deserializeError } from "./error-protocol";
import {
  uploadResultSchema,
  type UploadGrant,
  type UploadResult,
} from "./upload-protocol";

type Open = (
  grant: UploadGrant,
  port: MessagePort,
  handoff: () => boolean,
) => Promise<void>;
interface PendingTransfer {
  reservation: TransferReservation;
  stage: StageCapability;
  completed: boolean;
  retired: boolean;
  complete: (result: UploadResult) => void;
}
/** Admits before invoking a factory for a NEW dedicated peer worker, then owns its
 * lifecycle. Factories must clean up resources they throw before returning.
 * No payload buffers pass through this controller. */
export class BinaryTransferClient {
  private readonly direction: "upload" | "read";
  private readonly receiver: Worker;
  private readonly receiverExit: Promise<number>;
  private readonly pool: PersistenceBudgetPool;
  private readonly open: Open;
  private readonly cancel: (id: string) => Promise<void>;
  private readonly pending = new Map<string, PendingTransfer>();
  private readonly tasks = new Set<Promise<void>>();
  private readonly lost = Promise.withResolvers<never>();
  private failure: Error | undefined;
  private cleanupFailure: Error | undefined;
  public constructor(
    receiver: Worker,
    receiverExit: Promise<number>,
    pool: PersistenceBudgetPool,
    direction: "upload" | "read",
    open: Open,
    cancel: (id: string) => Promise<void>,
  ) {
    this.receiver = receiver;
    this.receiverExit = receiverExit;
    this.pool = pool;
    this.direction = direction;
    this.open = open;
    this.cancel = cancel;
    void this.lost.promise.catch(() => undefined); // Observed by active/future uploads.
    void receiverExit.then(
      () => {
        this.fail(new Error("Transfer receiver exited"));
        this.pending.clear();
      },
      (error: unknown) =>
        this.fail(
          new Error("Transfer receiver exit was not confirmed", {
            cause: error,
          }),
        ),
    );
  }
  private hasFailed(): boolean {
    return this.failure !== undefined;
  }
  public fail(error: Error): void {
    this.failure ??= error;
    this.lost.reject(this.failure);
  }
  public async drain(): Promise<void> {
    await Promise.allSettled(this.tasks);
    if (this.cleanupFailure) throw this.cleanupFailure;
  }
  public settle(id: string, input: UploadResult): void {
    const pending = this.pending.get(id);
    if (!pending || pending.completed)
      throw new Error("Unknown or repeated binary transfer completion");
    const result = uploadResultSchema.parse(input);
    if (result.kind === "sealed") {
      const cap = result.facts.capability;
      if (
        cap.generation !== pending.stage.generation ||
        cap.scope !== pending.stage.scope ||
        cap.id !== pending.stage.id
      )
        throw new Error("Foreign binary transfer completion");
    }
    pending.completed = true;
    pending.reservation.receiverClosed();
    pending.complete(result);
    if (pending.retired) this.pending.delete(id);
  }
  public async run(
    input: StageCapability,
    spawn: () => Worker,
    signal?: AbortSignal,
  ): Promise<SealedStage> {
    const cancelled = Promise.withResolvers<never>();
    const abortError = (): Error =>
      new Error("Binary transfer cancelled", { cause: signal?.reason });
    const onAbort = (): void => {
      cancelled.reject(abortError());
    };
    void cancelled.promise.catch(() => undefined); // Observed by every upload wait below.
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    const done = Promise.withResolvers<void>();
    const exited = Promise.withResolvers<number>();
    const producerFailed = Promise.withResolvers<never>();
    void producerFailed.promise.catch(() => undefined); // May fail before channel handoff.
    let producer: Worker | undefined;
    const onError = (error: Error): void => {
      producerFailed.reject(error);
    };
    const onExit = (code: number): void => {
      producer?.off("error", onError);
      exited.resolve(code);
      if (code !== 0)
        producerFailed.reject(new Error(`Transfer peer exited (${code})`));
    };
    const ports = new MessageChannel();
    const receipt = Promise.withResolvers<UploadResult>();
    let reservation: TransferReservation | undefined;
    let bound = false;
    const handoff: { attempted: boolean; cancelled: boolean } = {
      attempted: false,
      cancelled: false,
    };
    try {
      if (this.failure) throw this.failure;
      if (signal?.aborted) throw abortError();
      const stage = capabilitySchema.parse(input);
      reservation = (
        this.direction === "upload" ? this.pool.ingress : this.pool.egress
      ).reserve(this.receiver);
      this.tasks.add(done.promise);
      producer = spawn();
      if (producer === this.receiver) {
        producer = undefined;
        throw new Error("A transfer peer must not be the persistence worker");
      }
      producer.on("error", onError);
      producer.once("exit", onExit);
      if (producer.threadId <= 0) exited.resolve(-1);
      reservation.bindPeer(producer);
      bound = true;
      this.pending.set(reservation.id, {
        reservation,
        stage,
        completed: false,
        retired: false,
        complete: receipt.resolve,
      });
      const grant: UploadGrant = {
        id: reservation.id,
        pool: this.pool.id,
        direction: this.direction,
        stage,
      };
      await Promise.race([
        this.open(grant, ports.port1, () => {
          if (handoff.cancelled || signal?.aborted) return false;
          handoff.attempted = true;
          return true;
        }),
        producerFailed.promise,
        this.lost.promise,
        cancelled.promise,
      ]);
      if (producer.threadId <= 0)
        throw new Error("Transfer peer exited before handoff");
      producer.postMessage({ grant, port: ports.port2 }, [ports.port2]);
      const result = await Promise.race([
        receipt.promise,
        producerFailed.promise,
        this.lost.promise,
        cancelled.promise,
      ]);
      if (result.kind === "error") throw deserializeError(result.error);
      if (
        (await Promise.race([
          exited.promise,
          cancelled.promise,
          this.lost.promise,
        ])) !== 0
      )
        throw new Error("Transfer peer did not exit cleanly");
      await reservation.released;
      if (this.hasFailed()) await this.lost.promise;
      if (signal?.aborted) await cancelled.promise;
      return sealedSchema.parse(result.facts);
    } catch (error) {
      handoff.cancelled = true;
      ports.port1.close();
      ports.port2.close();
      if (!handoff.attempted) reservation?.receiverClosed();
      if (!bound) reservation?.cancelUnstarted();
      const errors: unknown[] = [error];
      let joined = producer === undefined;
      if (producer) {
        try {
          await producer.terminate();
          await exited.promise;
          joined = true;
        } catch (cleanup) {
          errors.push(cleanup);
        }
      }
      if (handoff.attempted) {
        try {
          if (this.hasFailed()) await this.receiverExit;
          else {
            // A peer can die before a handed-off port is installed. Do not rely
            // on its automatic port-close event: explicitly revoke this grant.
            if (reservation && !this.pending.get(reservation.id)?.completed)
              await this.cancel(reservation.id);
            await Promise.race([receipt.promise, this.receiverExit]);
          }
        } catch (cleanup) {
          errors.push(cleanup);
        }
      }
      if (joined && errors.length === 1) await reservation?.released;
      if (errors.length > 1) {
        const combined = new AggregateError(
          errors,
          "Binary transfer failed; cleanup could not be confirmed",
          { cause: error },
        );
        this.cleanupFailure = this.cleanupFailure
          ? new AggregateError(
              [this.cleanupFailure, combined],
              "Binary transfer cleanup failures",
              { cause: error },
            )
          : combined;
        this.fail(combined); // No further producer admissions after uncertain cleanup.
        throw combined;
      }
      throw error;
    } finally {
      signal?.removeEventListener("abort", onAbort);
      ports.port1.close();
      ports.port2.close();
      if (reservation) {
        const pending = this.pending.get(reservation.id);
        if (pending) {
          pending.retired = true;
          if (pending.completed || !handoff.attempted)
            this.pending.delete(reservation.id);
          // Failed cancellation keeps an observable entry until a real receiver
          // settlement/exit. A late valid completion is not an unknown reply.
        }
      }
      this.tasks.delete(done.promise);
      done.resolve();
      // If termination failed, retain the error observer until the actual exit.
      if (producer && producer.threadId <= 0) {
        producer.off("error", onError);
        producer.off("exit", onExit);
      }
    }
  }
}

import type { FaqCaptureDeps, FaqReconcileDeps } from "../../src";
import { captureReply, reconcileFaq } from "../../src";

/** The capture job, run as the queue runs it: its data and its signal. */
export function captureHandler(deps: FaqCaptureDeps): {
  process(
    data: Parameters<typeof captureReply>[1],
    jobId?: string,
    progress?: unknown,
    signal?: AbortSignal,
  ): ReturnType<typeof captureReply>;
} {
  return {
    process: (data, _jobId, _progress, signal) =>
      captureReply(deps, data, signal),
  };
}

/** The reconcile job, run as the queue runs it. */
export function reconcileHandler(deps: FaqReconcileDeps): {
  process(
    data: Parameters<typeof reconcileFaq>[1],
    jobId?: string,
    progress?: unknown,
    signal?: AbortSignal,
  ): ReturnType<typeof reconcileFaq>;
} {
  return {
    process: (data, _jobId, _progress, signal) =>
      reconcileFaq(deps, data, signal),
  };
}

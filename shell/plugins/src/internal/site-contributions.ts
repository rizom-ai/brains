import {
  SITE_BUILDER_CHANNELS,
  SdkError,
  sdkErrorCodeSchema,
  toSdkError,
} from "@brains/contracts";
import type { IMessageBus } from "@brains/messaging-service";
import { z } from "@brains/utils/zod";
import { collectSiteSlots } from "./site-slot-contributions";
import type { InstalledLayoutSlot } from "../service/site-slot-contract";

/** Fixed-topic, installed-owner collection; never an author-facing bus. */
export function createSiteContributions(
  bus: Pick<IMessageBus, "collect">,
  owner: string,
  lifetime: AbortSignal,
): {
  headScripts(signal?: AbortSignal): Promise<readonly string[]>;
  withSlots<T>(
    signal: AbortSignal,
    build: (slots: readonly InstalledLayoutSlot[]) => Promise<T>,
  ): Promise<T>;
} {
  return Object.freeze({
    async withSlots<T>(
      signal: AbortSignal,
      build: (slots: readonly InstalledLayoutSlot[]) => Promise<T>,
    ): Promise<T> {
      if (!(signal instanceof AbortSignal) || typeof build !== "function")
        throw new SdkError("invalid_input");
      const scope = new AbortController();
      try {
        const slots = await collectSiteSlots(
          bus,
          owner,
          lifetime,
          AbortSignal.any([signal, scope.signal]),
        );
        const result = await build(slots);
        if (lifetime.aborted || signal.aborted) throw new SdkError("cancelled");
        return result;
      } catch (cause) {
        throw toSdkError(cause);
      } finally {
        scope.abort();
      }
    },
    async headScripts(signal?: AbortSignal): Promise<readonly string[]> {
      const active = (): void => {
        if (lifetime.aborted || signal?.aborted)
          throw new SdkError("cancelled");
      };
      try {
        active();
        const answers = await bus.collect({
          type: SITE_BUILDER_CHANNELS.headScripts,
          payload: {},
          sender: owner,
        });
        // Cancellation closes admission and refuses the result; it does not
        // undo or interrupt already admitted contributor callbacks.
        active();
        return Object.freeze(
          answers.map((answer) => {
            if (!("success" in answer) || !answer.success) {
              const code =
                "code" in answer
                  ? sdkErrorCodeSchema.safeParse(answer.code).data
                  : undefined;
              throw new SdkError(code ?? "handler_failed", { cause: answer });
            }
            const script = z.string().safeParse(answer.data);
            if (!script.success) {
              throw new SdkError("invalid_response", { cause: answer });
            }
            return script.data;
          }),
        );
      } catch (cause) {
        active();
        throw toSdkError(cause);
      }
    },
  });
}

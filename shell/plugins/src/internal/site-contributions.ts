import {
  SITE_BUILDER_CHANNELS,
  SdkError,
  sdkErrorCodeSchema,
  toSdkError,
} from "@brains/contracts";
import type { IMessageBus } from "@brains/messaging-service";
import { z } from "@brains/utils/zod";

/** Fixed-topic, installed-owner collection; never an author-facing bus. */
export function createSiteContributions(
  bus: Pick<IMessageBus, "collect">,
  owner: string,
  lifetime: AbortSignal,
): {
  headScripts(signal?: AbortSignal): Promise<readonly string[]>;
} {
  return Object.freeze({
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

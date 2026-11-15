import type { IMessagingNamespace } from "../base/context-types";

/**
 * Hear a channel and run `run` each time it is heard, answering success
 * once the run settles; what the run returns is not the answer. The
 * release takes the subscription off.
 */
export function onEvent(
  messaging: Pick<IMessagingNamespace, "subscribe">,
  channel: string,
  run: () => Promise<unknown>,
): () => void {
  return messaging.subscribe(channel, async (): Promise<{ success: true }> => {
    await run();
    return { success: true };
  });
}

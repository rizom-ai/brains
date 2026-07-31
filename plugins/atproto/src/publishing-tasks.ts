import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { getErrorMessage } from "@brains/utils/error";
import type { AtprotoPublishFailedPayload } from "./publish-contracts";
import { ATPROTO_PUBLISH_FAILED } from "./publish-contracts";

/**
 * Serializes ambient publishing work per entity and drains it on shutdown.
 *
 * Operations for one key run in order: an upsert finishing after a delete
 * would resurrect the deleted record on the PDS. Distinct keys still run
 * concurrently.
 */
export class PublishingTaskQueue {
  private readonly active = new Set<Promise<void>>();
  private readonly chains = new Map<string, Promise<void>>();
  private readonly logger: Logger;
  private readonly canPublish: () => boolean;

  constructor(logger: Logger, canPublish: () => boolean) {
    this.logger = logger;
    this.canPublish = canPublish;
  }

  run(key: string, operation: () => Promise<void>): Promise<void> {
    const previous = this.chains.get(key) ?? Promise.resolve();
    const task = previous.then(operation).catch((error: unknown) => {
      this.logger.error("Unexpected AT Protocol publishing task failure", {
        error: getErrorMessage(error),
      });
    });
    this.chains.set(key, task);
    this.active.add(task);
    void task.then(() => {
      this.active.delete(task);
      if (this.chains.get(key) === task) {
        this.chains.delete(key);
      }
    });
    return task;
  }

  /** Wait for every in-flight task, including ones queued while draining. */
  async settle(): Promise<void> {
    while (this.active.size > 0) {
      await Promise.all(this.active);
    }
  }

  /**
   * Run an ambient publish, reporting failure rather than throwing — these
   * are triggered by entity events, so there is no caller to surface to.
   * A brain without publishing credentials silently does nothing.
   */
  async runTrigger(
    context: ServicePluginContext,
    details: Omit<AtprotoPublishFailedPayload, "error">,
    operation: () => Promise<unknown>,
  ): Promise<void> {
    if (!this.canPublish()) return;

    try {
      await operation();
    } catch (error) {
      await this.reportFailure(context, details, error);
    }
  }

  async reportFailure(
    context: ServicePluginContext,
    details: Omit<AtprotoPublishFailedPayload, "error">,
    error: unknown,
  ): Promise<void> {
    const errorMessage = getErrorMessage(error);
    this.logger.error("AT Protocol ambient publishing failed", {
      ...details,
      error: errorMessage,
    });

    try {
      await context.messaging.send({
        type: ATPROTO_PUBLISH_FAILED,
        payload: { ...details, error: errorMessage },
        broadcast: true,
      });
    } catch (reportError) {
      this.logger.error("Failed to report AT Protocol publishing failure", {
        error: getErrorMessage(reportError),
      });
    }
  }
}

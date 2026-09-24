import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { getErrorMessage } from "@brains/utils/error";
import type { AtprotoPublishFailedPayload } from "./publish-contracts";
import {
  ATPROTO_PUBLISH_FAILED,
  atprotoPublishFailedPayloadSchema,
} from "./publish-contracts";
import { collectAtprotoBlobEvidence } from "@brains/atproto-contracts";

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
      const recovery = collectAtprotoBlobEvidence(error);
      this.logger.error("Unexpected AT Protocol publishing task failure", {
        error: recovery
          ? "AT Protocol task failed; bounded recovery evidence attached"
          : getErrorMessage(error).slice(0, 1024),
        ...(recovery && { recovery }),
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
    details: Omit<AtprotoPublishFailedPayload, "error" | "recovery">,
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
    details: Omit<AtprotoPublishFailedPayload, "error" | "recovery">,
    error: unknown,
  ): Promise<void> {
    const recovery = collectAtprotoBlobEvidence(error);
    const parsed = atprotoPublishFailedPayloadSchema.safeParse({
      ...details,
      error: recovery
        ? "AT Protocol publication failed; bounded recovery evidence attached"
        : getErrorMessage(error).slice(0, 1024),
      ...(recovery && { recovery }),
    });
    if (!parsed.success) {
      // Invalid routing metadata is not permission to lose known receipts or
      // broadcast an unbounded payload. Keep bounded evidence in the log.
      this.logger.error("Invalid AT Protocol failure reporting metadata", {
        recovery,
      });
      return;
    }
    const payload = parsed.data;
    this.logger.error("AT Protocol ambient publishing failed", payload);

    try {
      await context.messaging.send({
        type: ATPROTO_PUBLISH_FAILED,
        payload,
        broadcast: true,
      });
    } catch (reportError) {
      this.logger.error("Failed to report AT Protocol publishing failure", {
        ...payload,
        reportingError: recovery
          ? "Failure event delivery failed"
          : getErrorMessage(reportError).slice(0, 512),
      });
    }
  }
}

import { Cause, Effect, Exit } from "@brains/utils/effect";
import type { Clock } from "@brains/utils/effect";
import type {
  IJobQueueService,
  JobHandler,
  JobOptions,
} from "@brains/job-queue";
import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
} from "@brains/runtime-state";
import type { ScheduledJob, SchedulerBackend } from "@brains/scheduler";
import { computeContentHash } from "@brains/utils/hash";
import type { Logger } from "@brains/utils/logger";
import { KeyedSerialQueue } from "@brains/utils/serial-queue";
import { z } from "@brains/utils/zod";
import type {
  IRecurringChecksNamespace,
  RecurringAlert,
  RecurringCheckCadence,
  RecurringCheckDefinition,
  RecurringCheckOpenAlert,
  RecurringCheckResult,
} from "./types";

export const RECURRING_CHECK_JOB_TYPE = "shell:recurring-check" as const;

const DAY_MS = 24 * 60 * 60 * 1_000;
const WEEK_MS = 7 * DAY_MS;
const FIRST_SUNDAY_UTC_MS = 3 * DAY_MS;

const recurringAlertSchema: z.ZodType<RecurringAlert, RecurringAlert> =
  z.strictObject({
    dedupeKey: z.string().min(1).max(512),
    title: z.string().min(1),
    body: z.string().min(1),
    html: z.string().min(1).optional(),
    includeInInbox: z.boolean().optional(),
  });

const recurringCheckResultSchema: z.ZodType<
  RecurringCheckResult,
  RecurringCheckResult
> = z.strictObject({
  alerts: z.array(recurringAlertSchema).optional(),
});

const recurringCheckJobSchema = z.strictObject({ checkId: z.string().min(1) });
type RecurringCheckJob = z.infer<typeof recurringCheckJobSchema>;

type RecurringCheckState =
  | { kind: "last-success"; checkId: string; at: string }
  | {
      kind: "alert";
      checkId: string;
      dedupeKey: string;
      status: "pending" | "suppressed" | "delivered" | "resolved";
      alert: RecurringAlert;
      observedAt: string;
      includeInInbox?: boolean | undefined;
      deliveredAt?: string | undefined;
      resolvedAt?: string | undefined;
    };

const recurringCheckStateSchema: z.ZodType<
  RecurringCheckState,
  RecurringCheckState
> = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("last-success"),
    checkId: z.string(),
    at: z.string().datetime(),
  }),
  z.strictObject({
    kind: z.literal("alert"),
    checkId: z.string(),
    dedupeKey: z.string(),
    status: z.enum(["pending", "suppressed", "delivered", "resolved"]),
    alert: recurringAlertSchema,
    observedAt: z.string().datetime(),
    includeInInbox: z.boolean().optional(),
    deliveredAt: z.string().datetime().optional(),
    resolvedAt: z.string().datetime().optional(),
  }),
]);

interface ActiveCheck {
  controller: AbortController;
  settled: Promise<void>;
}

interface RegisteredCheck {
  definition: RecurringCheckDefinition;
  pluginId: string;
  scheduledJob?: ScheduledJob | undefined;
  activeCheck?: ActiveCheck | undefined;
  catchUpTasks: Set<Promise<void>>;
  releasePromise?: Promise<void> | undefined;
}

/**
 * The job-queue operations recurring checks perform.
 *
 * IJobQueueService carries two dozen members; asking for all of them meant a
 * test could not supply three without asserting it was the whole service.
 */
export type RecurringCheckJobQueue = Pick<
  IJobQueueService,
  "enqueue" | "registerHandler" | "unregisterHandler"
>;

export interface RecurringCheckDelivery {
  /** Return false when no delivery channel is currently registered. */
  deliver(alert: RecurringAlert): Promise<boolean | void>;
}

export interface RecurringCheckServiceOptions {
  brainId: string;
  scheduler: SchedulerBackend;
  runtimeState: IRuntimeStateNamespace;
  jobQueue: RecurringCheckJobQueue;
  delivery: RecurringCheckDelivery;
  logger: Logger;
  /** Effect clock shared with scheduler tests. Defaults to the live clock. */
  clock?: Clock.Clock | undefined;
  /** @deprecated Prefer an Effect clock. */
  now?: (() => Date) | undefined;
}

export interface RecurringCheckSchedule {
  expression: string;
  offsetMs: number;
  periodMs: number;
  anchorMs: number;
}

export class RecurringCheckService {
  private readonly brainId: string;
  private readonly scheduler: SchedulerBackend;
  private readonly state: IRuntimeStateStore<RecurringCheckState>;
  private readonly jobQueue: RecurringCheckJobQueue;
  private readonly delivery: RecurringCheckDelivery;
  private readonly logger: Logger;
  private readonly clock: Clock.Clock | undefined;
  private readonly nowFallback: () => Date;
  private readonly checks = new Map<string, RegisteredCheck>();
  private readonly pluginChecks = new Map<string, Set<RegisteredCheck>>();
  private readonly alertOperations = new KeyedSerialQueue();
  private handlerRegistered = false;
  private started = false;
  private stopPromise: Promise<void> | null = null;

  constructor(options: RecurringCheckServiceOptions) {
    this.brainId = options.brainId;
    this.scheduler = options.scheduler;
    this.jobQueue = options.jobQueue;
    this.delivery = options.delivery;
    this.logger = options.logger.child("RecurringCheckService");
    this.clock = options.clock;
    this.nowFallback = options.now ?? ((): Date => new Date());
    this.state = options.runtimeState.scoped({
      namespace: "shell.recurring-checks",
      schema: recurringCheckStateSchema,
    });

    const handler: JobHandler<
      typeof RECURRING_CHECK_JOB_TYPE,
      RecurringCheckJob,
      void
    > = {
      validateAndParse: (data): RecurringCheckJob | null => {
        const parsed = recurringCheckJobSchema.safeParse(data);
        return parsed.success ? parsed.data : null;
      },
      process: async (data): Promise<void> => {
        await this.runNow(data.checkId);
      },
    };
    this.jobQueue.registerHandler(RECURRING_CHECK_JOB_TYPE, handler, "shell");
    this.handlerRegistered = true;
  }

  /** Roll back an installed but stopped service during shell construction. */
  abandon(): void {
    if (this.started) {
      throw new Error("Cannot abandon a running recurring check service");
    }
    if (!this.handlerRegistered) return;
    this.jobQueue.unregisterHandler(RECURRING_CHECK_JOB_TYPE);
    this.handlerRegistered = false;
  }

  namespace(pluginId: string): IRecurringChecksNamespace {
    return {
      register: (check): (() => void) => this.register(pluginId, check),
    };
  }

  register(pluginId: string, definition: RecurringCheckDefinition): () => void {
    assertValidIdentifier(pluginId, "plugin ID");
    assertValidIdentifier(definition.id, "check ID");
    const checkId = `${pluginId}:${definition.id}`;
    if (this.checks.has(checkId)) {
      throw new Error(`Recurring check already registered: ${checkId}`);
    }

    const registered: RegisteredCheck = {
      pluginId,
      definition: { ...definition, id: checkId },
      catchUpTasks: new Set(),
    };
    this.checks.set(checkId, registered);
    const pluginChecks = this.pluginChecks.get(pluginId) ?? new Set();
    pluginChecks.add(registered);
    this.pluginChecks.set(pluginId, pluginChecks);
    if (this.started) {
      this.schedule(registered);
      void this.trackCatchUp(registered).catch((error) => {
        this.logger.error(
          `Failed to enqueue recurring check ${checkId}`,
          error,
        );
      });
    }

    return (): void => {
      void this.releaseRegisteredCheck(
        registered,
        new Error(`Recurring check unregistered: ${checkId}`),
      ).catch((error) => {
        this.logger.error(
          `Failed to unregister recurring check ${checkId}`,
          error,
        );
      });
    };
  }

  async unregisterPlugin(pluginId: string): Promise<void> {
    const registered = [...(this.pluginChecks.get(pluginId) ?? [])];
    await Promise.all(
      registered.map((check) =>
        this.releaseRegisteredCheck(
          check,
          new Error(`Recurring check plugin unregistered: ${pluginId}`),
        ),
      ),
    );
  }

  async start(): Promise<void> {
    if (this.started) return;
    if (this.stopPromise) {
      await this.stopPromise;
      this.stopPromise = null;
    }
    this.started = true;
    for (const registered of this.checks.values()) this.schedule(registered);
    await Promise.all(
      [...this.checks.values()].map((registered) =>
        this.trackCatchUp(registered),
      ),
    );
  }

  stop(): Promise<void> {
    this.stopPromise ??= this.stopChecks();
    return this.stopPromise;
  }

  private async stopChecks(): Promise<void> {
    this.started = false;
    const stopError = new Error("Recurring check service stopped");
    const registered = [...this.pluginChecks.values()].flatMap((checks) => [
      ...checks,
    ]);
    await Promise.all(
      registered.map(
        (check) =>
          check.releasePromise ?? this.settleRegisteredCheck(check, stopError),
      ),
    );
  }

  async runNow(checkId: string, signal?: AbortSignal): Promise<boolean> {
    signal?.throwIfAborted();
    const registered = this.checks.get(checkId);
    if (!registered) throw new Error(`Unknown recurring check: ${checkId}`);
    if (registered.activeCheck) {
      this.logger.debug(`Skipping overlapping recurring check: ${checkId}`);
      return false;
    }

    const controller = new AbortController();
    const runSignal = signal
      ? AbortSignal.any([controller.signal, signal])
      : controller.signal;
    const run = this.executeRegisteredCheck(registered, runSignal);
    const activeCheck: ActiveCheck = {
      controller,
      settled: Promise.resolve(),
    };
    registered.activeCheck = activeCheck;
    const clearActiveCheck = (): void => {
      if (registered.activeCheck === activeCheck) {
        delete registered.activeCheck;
      }
    };
    activeCheck.settled = run.then(clearActiveCheck, clearActiveCheck);
    return run;
  }

  private async executeRegisteredCheck(
    registered: RegisteredCheck,
    runSignal: AbortSignal,
  ): Promise<boolean> {
    const checkId = registered.definition.id;
    const execution = Effect.tryPromise({
      try: async (effectSignal) => {
        const checkSignal = AbortSignal.any([runSignal, effectSignal]);
        const deliverAlerts = registered.definition.deliverAlerts !== false;
        if (deliverAlerts) {
          await this.flushPendingAlerts(checkId);
        } else {
          await this.suppressPendingAlerts(checkId);
        }
        checkSignal.throwIfAborted();
        const rawResult = await registered.definition.run({
          signal: checkSignal,
        });
        checkSignal.throwIfAborted();
        const result = recurringCheckResultSchema.parse(rawResult);
        for (const alert of result.alerts ?? []) {
          checkSignal.throwIfAborted();
          await this.recordAlert(checkId, alert, {
            deliver: deliverAlerts,
            includeInInbox:
              alert.includeInInbox ??
              registered.definition.includeInInbox !== false,
          });
        }
        await this.state.set(this.lastSuccessKey(checkId), {
          kind: "last-success",
          checkId,
          at: this.currentTime().toISOString(),
        });
      },
      catch: (error) => error,
    });

    const exit = await Effect.runPromiseExit(execution, {
      signal: runSignal,
    });
    if (Exit.isSuccess(exit)) return true;
    if (runSignal.aborted) throw runSignal.reason;
    throw Cause.squash(exit.cause);
  }

  getRegisteredCheckIds(): string[] {
    return [...this.checks.keys()];
  }

  private trackCatchUp(registered: RegisteredCheck): Promise<void> {
    const task = this.enqueueCatchUpIfNeeded(registered.definition);
    registered.catchUpTasks.add(task);
    const remove = (): void => {
      registered.catchUpTasks.delete(task);
    };
    void task.then(remove, remove);
    return task;
  }

  private releaseRegisteredCheck(
    registered: RegisteredCheck,
    reason: Error,
  ): Promise<void> {
    if (registered.releasePromise) return registered.releasePromise;
    const checkId = registered.definition.id;
    if (this.checks.get(checkId) === registered) {
      this.checks.delete(checkId);
    }

    const release = this.releaseRegisteredCheckOnce(registered, reason);
    registered.releasePromise = release;
    return release;
  }

  private async releaseRegisteredCheckOnce(
    registered: RegisteredCheck,
    reason: Error,
  ): Promise<void> {
    try {
      await this.settleRegisteredCheck(registered, reason);
    } finally {
      const pluginChecks = this.pluginChecks.get(registered.pluginId);
      pluginChecks?.delete(registered);
      if (pluginChecks?.size === 0) {
        this.pluginChecks.delete(registered.pluginId);
      }
    }
  }

  private async settleRegisteredCheck(
    registered: RegisteredCheck,
    reason: Error,
  ): Promise<void> {
    const tasks: Promise<unknown>[] = [];
    if (registered.scheduledJob) {
      tasks.push(registered.scheduledJob.stop());
      delete registered.scheduledJob;
    }
    if (registered.activeCheck) {
      registered.activeCheck.controller.abort(reason);
      tasks.push(registered.activeCheck.settled);
    }
    tasks.push(...registered.catchUpTasks);

    const results = await Promise.allSettled(tasks);
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failure) throw failure.reason;
  }

  private schedule(registered: RegisteredCheck): void {
    const check = registered.definition;
    const schedule = createRecurringCheckSchedule(
      this.brainId,
      check.id,
      check.cadence,
    );
    registered.scheduledJob = this.scheduler.scheduleCron(
      schedule.expression,
      async () => {
        try {
          await this.enqueue(check.id);
        } catch (error) {
          this.logger.error(
            `Failed to enqueue scheduled recurring check ${check.id}`,
            error,
          );
        }
      },
      { timezone: "UTC" },
    );
  }

  private async enqueueCatchUpIfNeeded(
    check: RecurringCheckDefinition,
  ): Promise<void> {
    const currentTime = this.currentTime();
    const schedule = createRecurringCheckSchedule(
      this.brainId,
      check.id,
      check.cadence,
    );
    const previousOccurrence = getPreviousOccurrence(currentTime, schedule);
    const lastSuccess = await this.state.get(this.lastSuccessKey(check.id));
    if (
      lastSuccess?.kind === "last-success" &&
      new Date(lastSuccess.at) >= previousOccurrence
    ) {
      return;
    }
    await this.enqueue(check.id);
  }

  private enqueue(checkId: string): Promise<string> {
    const options: JobOptions = {
      source: "shell",
      metadata: {
        operationType: "data_processing",
        operationTarget: checkId,
        silent: true,
      },
      maxRetries: 3,
      deduplication: "skip",
      deduplicationKey: checkId,
    };
    return this.jobQueue.enqueue({
      type: RECURRING_CHECK_JOB_TYPE,
      data: { checkId },
      options,
    });
  }

  async listOpenAlerts(): Promise<RecurringCheckOpenAlert[]> {
    const records = await this.state.list({ keyPrefix: "alert:" });
    return records
      .flatMap((record) => {
        // flatMap rather than filter+map: the discriminant check narrows
        // `state` for the projection below, which a separate filter callback
        // could not carry across.
        const state = record.value;
        if (state.kind !== "alert" || state.status === "resolved") return [];
        const includeInInbox =
          state.includeInInbox ??
          this.checks.get(state.checkId)?.definition.includeInInbox !== false;
        if (!includeInInbox) return [];
        return [
          {
            id: record.key,
            checkId: state.checkId,
            title: state.alert.title,
            body: state.alert.body,
            observedAt: state.observedAt,
          },
        ];
      })
      .sort(
        (left, right) =>
          left.observedAt.localeCompare(right.observedAt) ||
          left.id.localeCompare(right.id),
      );
  }

  async resolveOpenAlert(itemId: string): Promise<void> {
    await this.alertOperations.run(itemId, async () => {
      const state = await this.state.get(itemId);
      const includeInInbox =
        state?.kind === "alert" &&
        (state.includeInInbox ??
          this.checks.get(state.checkId)?.definition.includeInInbox !== false);
      if (
        state?.kind !== "alert" ||
        state.status === "resolved" ||
        !includeInInbox
      ) {
        throw new Error("Recurring-check inbox item is not open");
      }
      await this.state.set(itemId, {
        ...state,
        status: "resolved",
        resolvedAt: this.currentTime().toISOString(),
      });
    });
  }

  private async flushPendingAlerts(checkId: string): Promise<void> {
    const records = await this.state.list({
      keyPrefix: this.alertKeyPrefix(checkId),
    });
    for (const record of records) {
      await this.alertOperations.run(record.key, async () => {
        const state = await this.state.get(record.key);
        if (
          state?.kind === "alert" &&
          (state.status === "pending" || state.status === "suppressed")
        ) {
          await this.deliverStoredAlert(record.key, state);
        }
      });
    }
  }

  private async suppressPendingAlerts(checkId: string): Promise<void> {
    const records = await this.state.list({
      keyPrefix: this.alertKeyPrefix(checkId),
    });
    for (const record of records) {
      await this.alertOperations.run(record.key, async () => {
        const state = await this.state.get(record.key);
        if (state?.kind === "alert" && state.status === "pending") {
          await this.state.set(record.key, {
            ...state,
            status: "suppressed",
          });
        }
      });
    }
  }

  private async recordAlert(
    checkId: string,
    alert: RecurringAlert,
    options: { deliver: boolean; includeInInbox: boolean },
  ): Promise<void> {
    const parsedAlert = recurringAlertSchema.parse(alert);
    const key = this.alertKey(checkId, parsedAlert.dedupeKey);
    await this.alertOperations.run(key, async () => {
      const prior = await this.state.get(key);
      if (prior?.kind === "alert") {
        const current =
          prior.includeInInbox === options.includeInInbox
            ? prior
            : { ...prior, includeInInbox: options.includeInInbox };
        if (current !== prior) await this.state.set(key, current);
        if (current.status === "delivered" || current.status === "resolved") {
          return;
        }
        if (options.deliver) await this.deliverStoredAlert(key, current);
        return;
      }

      const pending: Extract<RecurringCheckState, { kind: "alert" }> = {
        kind: "alert",
        checkId,
        dedupeKey: parsedAlert.dedupeKey,
        status: options.deliver ? "pending" : "suppressed",
        alert: parsedAlert,
        observedAt: this.currentTime().toISOString(),
        includeInInbox: options.includeInInbox,
      };
      await this.state.set(key, pending);
      if (options.deliver) await this.deliverStoredAlert(key, pending);
    });
  }

  private async deliverStoredAlert(
    key: string,
    state: Extract<RecurringCheckState, { kind: "alert" }>,
  ): Promise<void> {
    const delivered = await this.delivery.deliver(state.alert);
    if (delivered === false) return;
    await this.state.set(key, {
      ...state,
      status: "delivered",
      deliveredAt: this.currentTime().toISOString(),
    });
  }

  private currentTime(): Date {
    return this.clock
      ? new Date(this.clock.unsafeCurrentTimeMillis())
      : this.nowFallback();
  }

  private lastSuccessKey(checkId: string): string {
    return `run:${computeContentHash(checkId)}`;
  }

  private alertKeyPrefix(checkId: string): string {
    return `alert:${computeContentHash(checkId)}:`;
  }

  private alertKey(checkId: string, dedupeKey: string): string {
    return `${this.alertKeyPrefix(checkId)}${computeContentHash(dedupeKey)}`;
  }
}

export function createRecurringCheckSchedule(
  brainId: string,
  checkId: string,
  cadence: RecurringCheckCadence,
): RecurringCheckSchedule {
  const periodMs = cadence === "daily" ? DAY_MS : WEEK_MS;
  const periodMinutes = periodMs / 60_000;
  const hash = computeContentHash(`${brainId}\0${checkId}\0${cadence}`);
  const offsetMinutes = Number.parseInt(hash.slice(0, 12), 16) % periodMinutes;
  const minute = offsetMinutes % 60;
  const totalHours = Math.floor(offsetMinutes / 60);
  const hour = totalHours % 24;
  const expression =
    cadence === "daily"
      ? `${minute} ${hour} * * *`
      : `${minute} ${hour} * * ${Math.floor(totalHours / 24)}`;
  return {
    expression,
    offsetMs: offsetMinutes * 60_000,
    periodMs,
    anchorMs: cadence === "daily" ? 0 : FIRST_SUNDAY_UTC_MS,
  };
}

export function getPreviousOccurrence(
  now: Date,
  schedule: RecurringCheckSchedule,
): Date {
  const timestamp = now.getTime();
  const elapsed = timestamp - schedule.anchorMs;
  const periodStart =
    schedule.anchorMs +
    Math.floor(elapsed / schedule.periodMs) * schedule.periodMs;
  let occurrence = periodStart + schedule.offsetMs;
  if (occurrence > timestamp) occurrence -= schedule.periodMs;
  return new Date(occurrence);
}

function assertValidIdentifier(value: string, label: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value)) {
    throw new Error(
      `Invalid recurring-check ${label}: ${value}. Use 1-64 alphanumeric, _, or - characters.`,
    );
  }
}

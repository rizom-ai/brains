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
import { z } from "@brains/utils/zod";
import type {
  IRecurringChecksNamespace,
  RecurringAlert,
  RecurringCheckCadence,
  RecurringCheckDefinition,
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
      status: "pending" | "delivered";
      alert: RecurringAlert;
      observedAt: string;
      deliveredAt?: string | undefined;
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
    status: z.enum(["pending", "delivered"]),
    alert: recurringAlertSchema,
    observedAt: z.string().datetime(),
    deliveredAt: z.string().datetime().optional(),
  }),
]);

interface RegisteredCheck {
  definition: RecurringCheckDefinition;
  pluginId: string;
  scheduledJob?: ScheduledJob | undefined;
}

export interface RecurringCheckDelivery {
  deliver(alert: RecurringAlert): Promise<void>;
}

export interface RecurringCheckServiceOptions {
  brainId: string;
  scheduler: SchedulerBackend;
  runtimeState: IRuntimeStateNamespace;
  jobQueue: IJobQueueService;
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
  private readonly jobQueue: IJobQueueService;
  private readonly delivery: RecurringCheckDelivery;
  private readonly logger: Logger;
  private readonly clock: Clock.Clock | undefined;
  private readonly nowFallback: () => Date;
  private readonly checks = new Map<string, RegisteredCheck>();
  private readonly runningChecks = new Map<string, AbortController>();
  private started = false;

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
    };
    this.checks.set(checkId, registered);
    if (this.started) {
      this.schedule(registered);
      void this.enqueueCatchUpIfNeeded(registered.definition).catch((error) => {
        this.logger.error(
          `Failed to enqueue recurring check ${checkId}`,
          error,
        );
      });
    }

    return (): void => this.unregister(checkId);
  }

  unregisterPlugin(pluginId: string): void {
    for (const [checkId, registered] of this.checks) {
      if (registered.pluginId === pluginId) this.unregister(checkId);
    }
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    for (const registered of this.checks.values()) this.schedule(registered);
    await Promise.all(
      [...this.checks.values()].map(({ definition }) =>
        this.enqueueCatchUpIfNeeded(definition),
      ),
    );
  }

  async stop(): Promise<void> {
    this.started = false;
    const stoppingJobs: Promise<void>[] = [];
    for (const registered of this.checks.values()) {
      if (registered.scheduledJob) {
        stoppingJobs.push(registered.scheduledJob.stop());
        delete registered.scheduledJob;
      }
    }
    const stopError = new Error("Recurring check service stopped");
    for (const controller of this.runningChecks.values()) {
      controller.abort(stopError);
    }
    await Promise.all(stoppingJobs);
  }

  async runNow(checkId: string, signal?: AbortSignal): Promise<boolean> {
    signal?.throwIfAborted();
    const registered = this.checks.get(checkId);
    if (!registered) throw new Error(`Unknown recurring check: ${checkId}`);
    if (this.runningChecks.has(checkId)) {
      this.logger.debug(`Skipping overlapping recurring check: ${checkId}`);
      return false;
    }

    const controller = new AbortController();
    const runSignal = signal
      ? AbortSignal.any([controller.signal, signal])
      : controller.signal;
    this.runningChecks.set(checkId, controller);
    const execution = Effect.tryPromise({
      try: async (effectSignal) => {
        const checkSignal = AbortSignal.any([runSignal, effectSignal]);
        await this.flushPendingAlerts(checkId);
        checkSignal.throwIfAborted();
        const rawResult = await registered.definition.run({
          signal: checkSignal,
        });
        checkSignal.throwIfAborted();
        const result = recurringCheckResultSchema.parse(rawResult);
        for (const alert of result.alerts ?? []) {
          checkSignal.throwIfAborted();
          await this.deliverAlert(checkId, alert);
        }
        await this.state.set(this.lastSuccessKey(checkId), {
          kind: "last-success",
          checkId,
          at: this.currentTime().toISOString(),
        });
      },
      catch: (error) => error,
    });

    try {
      const exit = await Effect.runPromiseExit(execution, {
        signal: runSignal,
      });
      if (Exit.isSuccess(exit)) return true;
      if (runSignal.aborted) throw runSignal.reason;
      throw Cause.squash(exit.cause);
    } finally {
      this.runningChecks.delete(checkId);
    }
  }

  getRegisteredCheckIds(): string[] {
    return [...this.checks.keys()];
  }

  private unregister(checkId: string): void {
    const registered = this.checks.get(checkId);
    void registered?.scheduledJob?.stop();
    this.checks.delete(checkId);
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

  private async flushPendingAlerts(checkId: string): Promise<void> {
    const records = await this.state.list({
      keyPrefix: this.alertKeyPrefix(checkId),
    });
    for (const record of records) {
      if (record.value.kind === "alert" && record.value.status === "pending") {
        await this.deliverStoredAlert(record.key, record.value);
      }
    }
  }

  private async deliverAlert(
    checkId: string,
    alert: RecurringAlert,
  ): Promise<void> {
    const parsedAlert = recurringAlertSchema.parse(alert);
    const key = this.alertKey(checkId, parsedAlert.dedupeKey);
    const prior = await this.state.get(key);
    if (prior?.kind === "alert" && prior.status === "delivered") return;
    if (prior?.kind === "alert" && prior.status === "pending") {
      await this.deliverStoredAlert(key, prior);
      return;
    }

    const pending: RecurringCheckState = {
      kind: "alert",
      checkId,
      dedupeKey: parsedAlert.dedupeKey,
      status: "pending",
      alert: parsedAlert,
      observedAt: this.currentTime().toISOString(),
    };
    await this.state.set(key, pending);
    await this.deliverStoredAlert(key, pending);
  }

  private async deliverStoredAlert(
    key: string,
    state: Extract<RecurringCheckState, { kind: "alert" }>,
  ): Promise<void> {
    await this.delivery.deliver(state.alert);
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

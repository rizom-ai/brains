import {
  notificationsSendContract,
  type WebRouteRole,
} from "@brains/contracts";
import type {
  BaseEntity,
  IRuntimeStateStore,
  RuntimeHealthCheck,
  WebRouteDefinition,
  WebRouteTransportContext,
} from "@brains/plugins";
import {
  classEntityServiceOf,
  entityCreatedChannel,
  entityDeletedChannel,
  entityUpdatedChannel,
  firstPartyJobHandler,
  type FirstPartyJobHandler,
  type ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import {
  siteBuilderPagesContract,
  siteBuilderRouteRegisterContract,
  siteMetadataContract,
  siteMetadataUpdatedChannel,
} from "@brains/site-composition";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import { FormAdmission } from "./admission";
import { formAdmissionPolicySchema } from "./admission-state";
import { formAlertText } from "./alert";
import { FORM_COPY, formCopyFor, type FormCopy } from "./copy";
import {
  formDefinitionSchema,
  type FormDefinition,
  type FormDefinitionInput,
} from "./definition";
import { FormDelivery, type FormAlertOutcome } from "./delivery";
import { parseFormMarkdown } from "./form-markdown";
import { formLanguages, localizeForm } from "./localize";
import { FormHttpHandlers, previewOriginFor } from "./http";
import { FormInboxSource } from "./inbox";
import { FormIntake, type FormMaintenanceReport } from "./intake";
import { formPageTemplate, formSitePages } from "./page";
import {
  resolveFormPolicy,
  type FormEnginePolicy,
  type FormPolicyOverrides,
} from "./policy";
import { FormReceipts } from "./receipts";
import { FormRecords, type FormEntityService } from "./records";
import type { FormDraft } from "./render";
import { FormStorageSlots, type FormStorageOptions } from "./storage-slots";
import type { FormInboxTarget, FormTarget } from "./target";

/** A form a target package ships. */
export interface BuiltInForm {
  definition: FormDefinitionInput;
  /** What the engine says around it, in the package's own words. */
  copy?: FormCopy | undefined;
  /** A draft from the link that opened it. */
  prefill?: ((url: URL) => FormDraft) | undefined;
  /** Where its state lives, when not under `forms.<id>`. */
  state?: { admission: string; storage: string } | undefined;
  /** Its entry in the brain's list of endpoints. */
  endpoint?: { label: string; priority: number } | undefined;
  /** The well-known role its page and post claim. */
  role?: WebRouteRole | undefined;
}

export interface FormServiceOptions<E extends BaseEntity> {
  /** Names the service in its errors and health, such as "Contact". */
  label: string;
  target: FormTarget<E>;
  forms: BuiltInForm[];
  overrides?: FormPolicyOverrides | undefined;
}

/** What the engine runs on: a target package's service runtime, as the
 * forms engine's service class read its context. */
export type FormRuntime = Pick<
  ServiceRuntime,
  | "pluginId"
  | "executionOnly"
  | "logger"
  | "siteUrl"
  | "localSiteUrl"
  | "preferLocalUrls"
  | "previewUrl"
  | "themeCSS"
  | "entityReads"
  | "entityWrites"
  | "permissions"
  | "classRuntimeState"
  | "identity"
  | "hasPlugin"
  | "routeByRole"
  | "inboxSource"
  | "template"
  | "messaging"
  | "answer"
  | "listen"
  | "jobs"
  | "recurringCheck"
  | "operationalHealth"
  | "endpoint"
>;

function declaresInbox<E extends BaseEntity>(
  target: FormTarget<E>,
): target is FormInboxTarget<E> {
  return target.inbox !== undefined;
}

/** A change to a form in content. */
const formChangeSchema = z.looseObject({ entityType: z.literal("form") });
/** The queue holds an id only, never submitted content. A job queued before
 * forms named theirs belongs to the first built-in form. */
const notificationJobSchema = z.strictObject({
  form: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,63}$/)
    .optional(),
  id: z.string().regex(/^[a-z][a-z0-9-]{0,63}[-:][a-f0-9]{64}$/),
});
const MAX_MAINTENANCE_AGE_MS = 26 * 60 * 60 * 1000;
/** Shared across processes: a separate worker runs the daily maintenance the
 * web process's intake depends on. */
const maintenanceStatusSchema = z.strictObject({
  at: z.number().int().nonnegative(),
  failed: z.boolean(),
});
type MaintenanceStatus = z.output<typeof maintenanceStatusSchema>;

/** One form as it runs: its definition and its own admission, ledger,
 * intake, delivery and pages. */
interface RunningForm {
  definition: FormDefinition;
  slots: FormStorageSlots;
  intake: FormIntake;
  delivery: FormDelivery;
  http: FormHttpHandlers;
  /** The form in each language it is translated to, at its own path. */
  translated: FormHttpHandlers[];
}

/**
 * Public forms on the brain's own origin, whose submissions become one
 * target's records: the target package's built-in forms, which content may
 * reword, and the forms content defines for the target. Readiness requires
 * recovery and the actual Studio Inbox destination, not a successful email
 * send. A target package runs one from its plugin's lifecycle.
 */
export class FormService<E extends BaseEntity = BaseEntity> {
  private readonly options: FormServiceOptions<E>;
  private runtime: FormRuntime | undefined;
  private entities: FormEntityService | undefined;
  private pluginId: string | undefined;
  private builtIns: Array<{ form: BuiltInForm; definition: FormDefinition }> =
    [];
  /** The forms served now, by id. */
  private forms = new Map<string, RunningForm>();
  /** What claim routes serve, by path: content's forms and every form's
   * translations, each with its thanks page. */
  private claimed = new Map<string, FormHttpHandlers>();
  /** Forms no longer served in this process; their alerts still settle. */
  private readonly retired = new Map<string, RunningForm>();
  private refreshing: Promise<void> = Promise.resolve();
  private policy: FormEnginePolicy | undefined;
  private records: FormRecords<E> | undefined;
  private readonly stop = new AbortController();
  private maintenance: Promise<void> | undefined;
  private maintenanceStatus: IRuntimeStateStore<MaintenanceStatus> | undefined;
  private report: FormMaintenanceReport | undefined;
  private readyState = false;
  private siteTheme: "light" | "dark" | undefined;

  constructor(options: FormServiceOptions<E>) {
    this.options = options;
  }

  private get label(): string {
    return this.options.label;
  }

  async register(runtime: FormRuntime): Promise<void> {
    const target = this.options.target;
    const { pluginId } = runtime;
    const entities = classEntityServiceOf(runtime);
    if (declaresInbox(target) && !runtime.executionOnly)
      runtime.inboxSource(
        new FormInboxSource(
          { entityService: entities, permissions: runtime.permissions },
          target,
        ),
      );
    // The forms serve the brain's own origin: its local site URL while the
    // brain prefers local URLs (a development run), else its domain.
    const origin =
      (runtime.preferLocalUrls ? runtime.localSiteUrl : runtime.siteUrl) ??
      runtime.localSiteUrl ??
      runtime.siteUrl;
    if (!origin)
      throw new Error(`${this.label} intake needs the brain's site URL`);
    const policy = resolveFormPolicy(this.options.overrides ?? {}, origin);
    this.policy = policy;
    const records = new FormRecords(entities, target);
    this.records = records;
    const definitions = this.options.forms.map((form) => ({
      form,
      definition: formDefinitionSchema.parse(form.definition),
    }));
    for (const { definition } of definitions) {
      const refusal = target.refuse(definition);
      if (refusal) throw new Error(refusal);
    }
    this.runtime = runtime;
    this.entities = entities;
    this.pluginId = pluginId;
    this.builtIns = definitions;
    // The site's own pages for the forms: its layout around an empty slot the
    // form fills per request. Declared in every process, as the site builds
    // in a separate worker, which registers plugins but never runs their
    // ready phase.
    runtime.template("page", formPageTemplate);
    await runtime.messaging.command(siteBuilderRouteRegisterContract, {
      pluginId,
      routes: definitions.flatMap(({ definition }) =>
        formSitePages(definition, pluginId),
      ),
    });
    // The pages of the forms content defines, for the build that asks: in
    // every process, as the site builds in a separate worker.
    runtime.answer(
      siteBuilderPagesContract,
      async () =>
        (await this.contentForms(runtime, entities))
          .filter(({ id }) => !this.isBuiltIn(id))
          .flatMap((definition) => formSitePages(definition, pluginId)),
      { everyProcess: true },
    );
    this.maintenanceStatus = runtime.classRuntimeState.scoped({
      namespace: `${pluginId}.maintenance`,
      schema: maintenanceStatusSchema,
    });
    for (const { form, definition } of definitions)
      this.forms.set(
        definition.id,
        this.run(runtime, entities, policy, records, form, definition),
      );
    if (!runtime.executionOnly)
      for (const channel of [
        entityCreatedChannel,
        entityUpdatedChannel,
        entityDeletedChannel,
      ])
        runtime.listen(
          channel,
          async ({ payload }) => {
            if (formChangeSchema.safeParse(payload).success)
              await this.refresh();
          },
          { mode: "observe" },
        );
    if (!runtime.executionOnly)
      runtime.listen(siteMetadataUpdatedChannel, ({ payload }) => {
        this.siteTheme = payload.themeMode;
      });
    for (const { form, definition } of definitions)
      if (form.endpoint)
        runtime.endpoint({
          label: form.endpoint.label,
          url: `${policy.http.origin}${definition.path}`,
          priority: form.endpoint.priority,
          visibility: "public",
        });
    runtime.recurringCheck({
      id: "maintenance",
      cadence: "daily",
      deliverAlerts: false,
      includeInInbox: false,
      run: async ({ signal }) => {
        await this.maintain(signal);
        return {};
      },
    });
    if (!runtime.executionOnly)
      runtime.operationalHealth("intake", () => this.health());
  }

  /** The owner's alert job: the queue holds a form's id and a record's id,
   * never submitted content. */
  notificationJob(): FirstPartyJobHandler {
    return firstPartyJobHandler({
      type: "notify",
      input: notificationJobSchema,
      executionTimeoutMs: 60_000,
      process: async ({ input, signal }) => {
        const form = await this.formFor(input.form);
        if (!form)
          throw new Error(
            `Invalid ${this.label.toLowerCase()} notification job`,
          );
        return form.delivery.deliver(input.id, signal);
      },
    });
  }

  /** A job without a form is the first built-in form's. A form this process
   * has not seen yet is read from content. */
  private async formFor(
    id: string | undefined,
  ): Promise<RunningForm | undefined> {
    const known = id ?? this.builtIns[0]?.definition.id;
    if (known === undefined) return undefined;
    const form = this.forms.get(known) ?? this.retired.get(known);
    if (form) return form;
    await this.refresh();
    return this.forms.get(known);
  }

  private isBuiltIn(id: string): boolean {
    return this.builtIns.some(({ definition }) => definition.id === id);
  }

  /** The forms content defines for this target, each as the engine runs it.
   * One its target cannot hold, whose limits do not fit, or that takes a
   * built-in form's path is left out, and said so in the log. */
  private async contentForms(
    runtime: FormRuntime,
    entityService: FormEntityService,
  ): Promise<FormDefinition[]> {
    const target = this.options.target;
    const entities = await entityService
      .listEntities({
        entityType: "form",
        options: {
          limit: 1000,
          filter: {
            visibilityScope: "public",
            metadata: { target: target.entityType },
          },
        },
      })
      .catch(() => {
        // A brain without the form type holds no forms in its content.
        return [];
      });
    const builtInPaths = new Set(
      this.builtIns.flatMap(({ definition }) => [
        definition.path,
        `${definition.path}/thanks`,
      ]),
    );
    return entities.flatMap((entity): FormDefinition[] => {
      try {
        const definition = parseFormMarkdown(entity.id, entity.content);
        if (definition.target !== target.entityType) return [];
        const refusal = target.refuse(definition);
        if (refusal) throw new Error(refusal);
        formAdmissionPolicySchema.parse({
          ...this.policy?.admission,
          ...definition.limits,
        });
        if (
          !this.isBuiltIn(definition.id) &&
          [definition.path, `${definition.path}/thanks`].some((path) =>
            builtInPaths.has(path),
          )
        )
          throw new Error(
            `Form "${definition.id}" takes a built-in form's path`,
          );
        return [definition];
      } catch (error) {
        // One broken form must not take the others down: it is left out,
        // and the log says which and why; the owner fixes it in content.
        runtime.logger.warn("A form in content is not served", {
          form: entity.id,
          reason: getErrorMessage(error, "invalid"),
        });
        return [];
      }
    });
  }

  /** Serve what content says now. Refreshes run one at a time. */
  refresh(): Promise<void> {
    this.refreshing = this.refreshing.then(
      () => this.load(),
      () => this.load(),
    );
    return this.refreshing;
  }

  private async load(): Promise<void> {
    const runtime = this.runtime;
    const entities = this.entities;
    const policy = this.policy;
    const records = this.records;
    if (!runtime || !entities || !policy || !records) return;
    const content = await this.contentForms(runtime, entities);
    const byId = new Map(
      content.map((definition) => [definition.id, definition]),
    );
    const next = new Map<string, RunningForm>();
    for (const { form, definition } of this.builtIns) {
      // Content may change a built-in form's words and fields, never its path.
      const override = byId.get(definition.id);
      const current = override
        ? { ...override, path: definition.path }
        : definition;
      next.set(
        definition.id,
        this.run(runtime, entities, policy, records, form, current),
      );
    }
    for (const definition of content) {
      if (this.isBuiltIn(definition.id)) continue;
      next.set(
        definition.id,
        this.run(
          runtime,
          entities,
          policy,
          records,
          { definition },
          definition,
        ),
      );
    }
    const claimed = new Map<string, FormHttpHandlers>();
    for (const running of next.values()) {
      const served = [
        ...(this.isBuiltIn(running.definition.id) ? [] : [running.http]),
        ...running.translated,
      ];
      for (const http of served) {
        claimed.set(http.path, http);
        claimed.set(`${http.path}/thanks`, http);
      }
    }
    for (const [id, running] of this.forms)
      if (!next.has(id)) this.retired.set(id, running);
    for (const id of next.keys()) this.retired.delete(id);
    this.forms = next;
    this.claimed = claimed;
  }

  private run(
    runtime: FormRuntime,
    entities: FormEntityService,
    policy: FormEnginePolicy,
    records: FormRecords<E>,
    form: BuiltInForm,
    definition: FormDefinition,
  ): RunningForm {
    const state = form.state ?? {
      admission: `forms.${definition.id}.admission`,
      storage: `forms.${definition.id}.storage`,
    };
    const slots: FormStorageOptions = {
      namespace: state.storage,
      idPrefix: definition.id,
      separator: this.options.target.idSeparator,
    };
    const copy = form.copy ?? FORM_COPY;
    const delivery = new FormDelivery({
      target: records,
      state: runtime.classRuntimeState,
      slots,
      policy: policy.delivery,
      send: (id, idempotencyKey): Promise<FormAlertOutcome> =>
        this.send(runtime, records, definition, id, idempotencyKey),
    });
    const admission = new FormAdmission(
      runtime.classRuntimeState,
      formAdmissionPolicySchema.parse({
        ...policy.admission,
        ...definition.limits,
      }),
      {
        namespace: state.admission,
        idPrefix: definition.id,
        separator: this.options.target.idSeparator,
      },
    );
    // Jobs for the first built-in form name no form, as before forms did.
    const first = this.builtIns[0]?.definition.id === definition.id;
    const enqueueNotification = async (id: string): Promise<void> => {
      await runtime.jobs.enqueue({
        type: "notify",
        data: first ? { id } : { form: definition.id, id },
        toolContext: null,
        options: {
          source: definition.id,
          metadata: { operationType: "data_processing", silent: true },
          deduplication: "skip",
          deduplicationKey: `${definition.id}-notification:${id}`,
          maxRetries: policy.delivery.maxAttempts,
        },
      });
    };
    const receipts = definition.scoring
      ? new FormReceipts(
          runtime.classRuntimeState,
          `forms.${definition.id}.receipts`,
          policy.admission.receiptTtlSeconds,
        )
      : undefined;
    /** The form in one language: its own words, one admission for all. */
    const serve = (
      served: FormDefinition,
      words: FormCopy,
      language?: string,
    ): { intake: FormIntake; http: FormHttpHandlers } => {
      const intake = new FormIntake({
        form: served,
        target: this.options.target,
        admission,
        entities,
        state: runtime.classRuntimeState,
        slots,
        messages: words.fields,
        language,
        enqueueNotification,
      });
      const http = new FormHttpHandlers(
        served,
        admission,
        intake,
        policy.http,
        {
          themeCSS: runtime.themeCSS,
          // The deployment's own preview host is served beside the origin.
          previewOrigin: previewOriginFor(
            policy.http.origin,
            runtime.previewUrl,
          ),
          owner: (): string => runtime.identity.getProfile().name,
          defaultTheme: (): "light" | "dark" | undefined => this.siteTheme,
          copy: words,
          prefill: form.prefill,
          receipts,
          language,
        },
      );
      return { intake, http };
    };
    const written = serve(definition, copy);
    return {
      definition,
      slots: new FormStorageSlots(runtime.classRuntimeState, slots, Date.now),
      intake: written.intake,
      delivery,
      http: written.http,
      translated: formLanguages(definition).map(
        (language) =>
          serve(
            localizeForm(definition, language),
            formCopyFor(language),
            language,
          ).http,
      ),
    };
  }

  /** The owner's alert: the submission under the form's labels, answered by
   * replying to who sent it. */
  private async send(
    runtime: FormRuntime,
    records: FormRecords<E>,
    form: FormDefinition,
    id: string,
    idempotencyKey: string,
  ): Promise<FormAlertOutcome> {
    const inbox = this.inboxUrl(runtime);
    if (!inbox) return { sent: false, failure: "no-inbox" };
    const alert = await records.alert(id, form);
    if (!alert) return { sent: false, failure: "no-record" };
    const result = await runtime.messaging.request(notificationsSendContract, {
      title: form.notify.title,
      body: formAlertText({
        answers: alert.answers,
        outcomes: alert.outcomes,
        inboxUrl: inbox,
        replyable: alert.replyTo !== undefined,
      }),
      sensitivity: "secret",
      idempotencyKey,
      ...(alert.replyTo ? { replyTo: alert.replyTo } : {}),
    });
    if (result.status === "unavailable")
      return { sent: false, failure: "no-notifier" };
    // A fault answering, unlike a refusal, says nothing of the outcome.
    if (result.status === "failed")
      return { sent: false, failure: "unconfirmed" };
    if (result.data.status === "sent") return { sent: true };
    // A refusal names its reason; a failed delivery, its transport's code.
    return {
      sent: false,
      failure: result.data.transportCode ?? result.data.failure,
    };
  }

  /** Built-in forms at their own paths, each served as content has it at
   * the time of the request; content's forms wherever they claim. Every
   * route is public and served on the preview host too. */
  webRoutes(): WebRouteDefinition[] {
    const pluginId = this.pluginId;
    if (!pluginId) return [];
    const builtIn = this.builtIns.flatMap(({ form, definition }) => {
      const serve = (
        request: Request,
        transport?: WebRouteTransportContext,
      ): Promise<Response> =>
        this.serve(this.forms.get(definition.id)?.http, request, transport);
      const role = form.role ? { role: form.role } : {};
      return [
        { path: definition.path, method: "GET" as const, ...role },
        { path: definition.path, method: "POST" as const, ...role },
        { path: `${definition.path}/thanks`, method: "GET" as const },
      ].map((route) => ({
        ...route,
        public: true,
        preview: true,
        handler: serve,
      }));
    });
    const claim = (method: "GET" | "POST"): WebRouteDefinition => ({
      path: `/_forms/${pluginId}`,
      match: "claim",
      method,
      public: true,
      preview: true,
      claims: (path: string): boolean => {
        const http = this.claimed.get(path);
        return http !== undefined && (method === "GET" || path === http.path);
      },
      handler: (request, transport) =>
        this.serve(
          this.claimed.get(new URL(request.url).pathname),
          request,
          transport,
        ),
    });
    return [...builtIn, claim("GET"), claim("POST")];
  }

  private async serve(
    http: FormHttpHandlers | undefined,
    request: Request,
    transport?: WebRouteTransportContext,
  ): Promise<Response> {
    if (!http) return new Response("Not found", { status: 404 });
    if (!this.readyState || !(await this.maintenanceFresh()))
      return http.unavailable(request);
    return http.handle(request, transport);
  }

  /** Every form whose submissions may still need work in this process. */
  private running(): RunningForm[] {
    return [...this.forms.values(), ...this.retired.values()];
  }

  async ready(): Promise<void> {
    const runtime = this.runtime;
    // A separate worker never serves the forms, so it is never ready to.
    if (!runtime || runtime.executionOnly) return;
    if (!runtime.hasPlugin("unified-inbox") || !this.inboxUrl(runtime))
      throw new Error(`${this.label} Inbox unavailable`);
    await this.readSiteTheme(runtime);
    await this.refresh();
    await this.maintain(this.stop.signal);
    this.stop.signal.throwIfAborted();
    this.readyState = true;
  }

  /** Where the alerts point: the unified-inbox workspace under Studio's
   * mounted workspaces route, on the forms' origin. Nothing while Studio
   * mounts no such route. */
  private inboxUrl(runtime: FormRuntime): string | undefined {
    const origin = this.policy?.http.origin;
    const workspaces = runtime.routeByRole("studio-workspaces");
    return origin && workspaces
      ? `${origin}${workspaces.fullPath}/unified-inbox%3Ainbox`
      : undefined;
  }

  /** A form opens in the site's own theme when a link names none. */
  private async readSiteTheme(runtime: FormRuntime): Promise<void> {
    const result = await runtime.messaging.request(siteMetadataContract, {});
    // No site describes a theme; the page keeps its own default.
    if (result.status === "answered") this.siteTheme = result.data.themeMode;
  }

  private maintain(signal: AbortSignal): Promise<void> {
    const combined = AbortSignal.any([signal, this.stop.signal]);
    combined.throwIfAborted();
    this.maintenance ??= this.runMaintenance(combined).finally(() => {
      this.maintenance = undefined;
    });
    return this.maintenance;
  }

  private async runMaintenance(signal: AbortSignal): Promise<void> {
    try {
      if (!this.maintenanceStatus)
        throw new Error(`${this.label} intake unavailable`);
      // The worker that maintains learns content's forms here.
      await this.refresh();
      const reports = await Promise.all(
        this.running().map((form) => form.intake.maintain(signal)),
      );
      this.report = reports.reduce(
        (sum, report) => ({
          released: sum.released + report.released,
          pendingNotifications:
            sum.pendingNotifications + report.pendingNotifications,
          enqueueFailures: sum.enqueueFailures + report.enqueueFailures,
          uncertainWrites: sum.uncertainWrites + report.uncertainWrites,
        }),
        {
          released: 0,
          pendingNotifications: 0,
          enqueueFailures: 0,
          uncertainWrites: 0,
        },
      );
      signal.throwIfAborted();
      await this.maintenanceStatus.set("status", {
        at: Date.now(),
        failed: false,
      });
    } catch {
      await this.recordMaintenanceFailure();
      throw new Error(`${this.label} maintenance unavailable`);
    }
  }

  private async recordMaintenanceFailure(): Promise<void> {
    try {
      const previous = await this.maintenanceStatus?.get("status");
      await this.maintenanceStatus?.set("status", {
        at: previous?.at ?? 0,
        failed: true,
      });
    } catch {
      // The status store itself failed; an unreadable status already keeps
      // intake closed, and the caller reports the maintenance failure.
    }
  }

  private async maintenanceFresh(): Promise<boolean> {
    if (this.stop.signal.aborted || !this.maintenanceStatus) return false;
    try {
      const status = await this.maintenanceStatus.get("status");
      const now = Date.now();
      return (
        status !== null &&
        !status.failed &&
        now >= status.at &&
        now - status.at <= MAX_MAINTENANCE_AGE_MS
      );
    } catch {
      // An unreadable status cannot show that recovery ran; keep intake closed.
      return false;
    }
  }

  private async health(): Promise<Omit<RuntimeHealthCheck, "name">> {
    try {
      const records = this.records;
      if (!records || !(await this.maintenanceFresh()))
        return {
          status: "unhealthy",
          message: `${this.label} recovery is unavailable or overdue; intake is closed.`,
        };
      const slots = (
        await Promise.all(this.running().map((form) => form.slots.list()))
      ).flat();
      const pending = slots.filter(
        ([, slot]) => slot.delivery.status === "pending",
      ).length;
      const failed = slots
        .filter(([, slot]) => slot.delivery.status === "failed")
        .map(([id]) => id);
      // Failed alerts whose record still waits in the Inbox. Marking it Done
      // acknowledges the failure: the owner has seen what the alert was for.
      const failedUnhandled = (
        await Promise.all(failed.map((id) => records.handled(id)))
      ).filter((handled) => handled === false).length;
      // Why failed alerts failed, by code: the cause without the server log.
      const failures = slots
        .flatMap(([, slot]) =>
          slot.delivery.status === "failed"
            ? [slot.delivery.failure ?? "unrecorded"]
            : [],
        )
        .reduce<Record<string, number>>(
          (counts, code) => ({ ...counts, [code]: (counts[code] ?? 0) + 1 }),
          {},
        );
      const unconfirmed = slots.filter(
        ([, slot]) => slot.phase === "writing",
      ).length;
      return {
        status:
          pending ||
          failedUnhandled ||
          unconfirmed ||
          this.report?.enqueueFailures
            ? "degraded"
            : "healthy",
        message: `${this.label} operational counts. A failed alert counts until its record is marked Done in the Inbox; failure can include an unconfirmed provider outcome.`,
        details: {
          inFlight: slots.length,
          pending,
          failed: failed.length,
          failedUnhandled,
          failures,
          unconfirmed,
          lastMaintenanceAt: (await this.maintenanceStatus?.get("status"))?.at,
          ...this.report,
        },
      };
    } catch {
      // State errors can contain stored values; report failure, never those values.
      return {
        status: "unhealthy",
        message: `${this.label} operational state unavailable.`,
      };
    }
  }

  async shutdown(): Promise<void> {
    this.readyState = false;
    this.stop.abort();
    await this.maintenance?.catch(() => {
      // The initiating lifecycle/check caller received the sanitized failure;
      // shutdown still drains the owned work after aborting it.
    });
  }
}

import {
  ENTITY_CHANNELS,
  notificationsSendContract,
  type WebRouteRole,
} from "@brains/contracts";
import type {
  BaseEntity,
  IRuntimeStateStore,
  RuntimeHealthCheck,
  ServicePluginContext,
  WebRouteDefinition,
  WebRouteTransportContext,
} from "@brains/plugins";
import {
  SITE_METADATA_UPDATED_CHANNEL,
  siteBuilderPagesContract,
  siteBuilderRouteRegisterContract,
  siteMetadataContract,
} from "@brains/site-composition";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import { FormAdmission } from "./admission";
import { formAdmissionPolicySchema } from "./admission-state";
import { formAlertText } from "./alert";
import { FORM_COPY, type FormCopy } from "./copy";
import {
  formDefinitionSchema,
  type FormDefinition,
  type FormDefinitionInput,
} from "./definition";
import { FormDelivery, type FormAlertOutcome } from "./delivery";
import { parseFormMarkdown } from "./form-markdown";
import { FormHttpHandlers, previewOriginFor } from "./http";
import { FormIntake, type FormMaintenanceReport } from "./intake";
import { formPageTemplate, formSitePages } from "./page";
import {
  resolveFormPolicy,
  type FormEnginePolicy,
  type FormPolicyOverrides,
} from "./policy";
import { FormRecords } from "./records";
import type { FormDraft } from "./render";
import { FormStorageSlots, type FormStorageOptions } from "./storage-slots";
import type { FormTarget } from "./target";

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

/** A change to a form in content. */
const formChangeSchema = z.looseObject({ entityType: z.literal("form") });
/** The queue holds an id only, never submitted content. A job queued before
 * forms named theirs belongs to the first built-in form. */
const notificationJobSchema = z.strictObject({
  form: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,63}$/)
    .optional(),
  id: z.string().regex(/^[a-z][a-z0-9-]{0,63}-[a-f0-9]{64}$/),
});
const MAX_MAINTENANCE_AGE_MS = 26 * 60 * 60 * 1000;
/** Shared across processes: a separate worker runs the daily maintenance the
 * web process's intake depends on. */
const maintenanceStatusSchema = z.strictObject({
  at: z.number().int().nonnegative(),
  failed: z.boolean(),
});
type MaintenanceStatus = z.output<typeof maintenanceStatusSchema>;
/** Only the theme is read from the site's metadata. */
const siteThemeSchema = z.looseObject({
  themeMode: z.enum(["light", "dark"]).optional(),
});

/** One form as it runs: its definition and its own admission, ledger,
 * intake, delivery and pages. */
interface RunningForm {
  definition: FormDefinition;
  slots: FormStorageSlots;
  intake: FormIntake;
  delivery: FormDelivery;
  http: FormHttpHandlers;
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
  private context: ServicePluginContext | undefined;
  private pluginId: string | undefined;
  private builtIns: Array<{ form: BuiltInForm; definition: FormDefinition }> =
    [];
  /** The forms served now, by id. */
  private forms = new Map<string, RunningForm>();
  /** Content's forms by the paths they claim: theirs and their thanks page. */
  private claimed = new Map<string, RunningForm>();
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
  private readonly unregister: Array<() => void> = [];

  constructor(options: FormServiceOptions<E>) {
    this.options = options;
  }

  private get label(): string {
    return this.options.label;
  }

  async register(
    context: ServicePluginContext,
    pluginId: string,
  ): Promise<void> {
    // The forms serve the brain's own origin: its local site URL while the
    // brain prefers local URLs (a development run), else its domain.
    const origin =
      (context.preferLocalUrls ? context.localSiteUrl : context.siteUrl) ??
      context.localSiteUrl ??
      context.siteUrl;
    if (!origin)
      throw new Error(`${this.label} intake needs the brain's site URL`);
    const policy = resolveFormPolicy(this.options.overrides ?? {}, origin);
    this.policy = policy;
    const target = this.options.target;
    const records = new FormRecords(context.entityService, target);
    this.records = records;
    const definitions = this.options.forms.map((form) => ({
      form,
      definition: formDefinitionSchema.parse(form.definition),
    }));
    for (const { definition } of definitions) {
      const refusal = target.refuse(definition);
      if (refusal) throw new Error(refusal);
    }
    this.context = context;
    this.pluginId = pluginId;
    this.builtIns = definitions;
    // The site's own pages for the forms: its layout around an empty slot the
    // form fills per request. Declared in every process, as the site builds
    // in a separate worker, which registers plugins but never runs their
    // ready phase.
    context.templates.register({ page: formPageTemplate });
    await context.messaging.command(siteBuilderRouteRegisterContract, {
      pluginId,
      routes: definitions.flatMap(({ definition }) =>
        formSitePages(definition, pluginId),
      ),
    });
    // The pages of the forms content defines, for the build that asks: in
    // every process, as the site builds in a separate worker.
    context.messaging.answer(
      siteBuilderPagesContract,
      async () =>
        (await this.contentForms(context))
          .filter(({ id }) => !this.isBuiltIn(id))
          .flatMap((definition) => formSitePages(definition, pluginId)),
      { everyProcess: true },
    );
    this.maintenanceStatus = context.runtimeState.scoped({
      namespace: `${pluginId}.maintenance`,
      schema: maintenanceStatusSchema,
    });
    for (const { form, definition } of definitions)
      this.forms.set(
        definition.id,
        this.run(context, policy, records, form, definition),
      );
    if (!context.executionOnly)
      for (const channel of [
        ENTITY_CHANNELS.created,
        ENTITY_CHANNELS.updated,
        ENTITY_CHANNELS.deleted,
      ])
        context.messaging.observe(channel, async (message) => {
          if (formChangeSchema.safeParse(message.payload).success)
            await this.refresh();
          return { success: true };
        });
    context.jobs.registerHandler("notify", {
      executionTimeoutMs: 60_000,
      validateAndParse: (input) => {
        const parsed = notificationJobSchema.safeParse(input);
        return parsed.success ? parsed.data : null;
      },
      process: async (input, _jobId, _progress, signal) => {
        const data = notificationJobSchema.safeParse(input);
        const form = data.success
          ? await this.formFor(data.data.form)
          : undefined;
        if (!data.success || !form)
          throw new Error(
            `Invalid ${this.label.toLowerCase()} notification job`,
          );
        return form.delivery.deliver(data.data.id, signal);
      },
    });
    if (!context.executionOnly)
      context.messaging.subscribe<unknown, { success: boolean }>(
        SITE_METADATA_UPDATED_CHANNEL,
        async (message) => {
          this.siteTheme = siteThemeSchema.safeParse(message.payload).data
            ?.themeMode;
          return { success: true };
        },
      );
    for (const { form, definition } of definitions)
      if (form.endpoint)
        context.endpoints.register({
          label: form.endpoint.label,
          url: `${policy.http.origin}${definition.path}`,
          priority: form.endpoint.priority,
          visibility: "public",
        });
    this.unregister.push(
      context.recurringChecks.register({
        id: "maintenance",
        cadence: "daily",
        deliverAlerts: false,
        includeInInbox: false,
        run: async ({ signal }) => {
          await this.maintain(signal);
          return {};
        },
      }),
    );
    if (!context.executionOnly)
      this.unregister.push(
        context.operationalHealth.register("intake", () => this.health()),
      );
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
    context: ServicePluginContext,
  ): Promise<FormDefinition[]> {
    const target = this.options.target;
    const entities = await context.entityService
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
        context.logger.warn("A form in content is not served", {
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
    const context = this.context;
    const policy = this.policy;
    const records = this.records;
    if (!context || !policy || !records) return;
    const content = await this.contentForms(context);
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
        this.run(context, policy, records, form, current),
      );
    }
    const claimed = new Map<string, RunningForm>();
    for (const definition of content) {
      if (this.isBuiltIn(definition.id)) continue;
      const running = this.run(
        context,
        policy,
        records,
        { definition },
        definition,
      );
      next.set(definition.id, running);
      claimed.set(definition.path, running);
      claimed.set(`${definition.path}/thanks`, running);
    }
    for (const [id, running] of this.forms)
      if (!next.has(id)) this.retired.set(id, running);
    for (const id of next.keys()) this.retired.delete(id);
    this.forms = next;
    this.claimed = claimed;
  }

  private run(
    context: ServicePluginContext,
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
    };
    const copy = form.copy ?? FORM_COPY;
    const delivery = new FormDelivery({
      target: records,
      state: context.runtimeState,
      slots,
      policy: policy.delivery,
      send: (id, idempotencyKey): Promise<FormAlertOutcome> =>
        this.send(context, records, definition, id, idempotencyKey),
    });
    const admission = new FormAdmission(
      context.runtimeState,
      formAdmissionPolicySchema.parse({
        ...policy.admission,
        ...definition.limits,
      }),
      { namespace: state.admission, idPrefix: definition.id },
    );
    // Jobs for the first built-in form name no form, as before forms did.
    const first = this.builtIns[0]?.definition.id === definition.id;
    const intake = new FormIntake({
      form: definition,
      target: this.options.target,
      admission,
      entities: context.entityService,
      state: context.runtimeState,
      slots,
      messages: copy.fields,
      enqueueNotification: async (id): Promise<void> => {
        await context.jobs.enqueue({
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
      },
    });
    const http = new FormHttpHandlers(
      definition,
      admission,
      intake,
      policy.http,
      {
        themeCSS: context.themeCSS,
        // The deployment's own preview host is served beside the origin.
        previewOrigin: previewOriginFor(policy.http.origin, context.previewUrl),
        owner: (): string => context.identity.getProfile().name,
        defaultTheme: (): "light" | "dark" | undefined => this.siteTheme,
        copy,
        prefill: form.prefill,
      },
    );
    return {
      definition,
      slots: new FormStorageSlots(context.runtimeState, slots, Date.now),
      intake,
      delivery,
      http,
    };
  }

  /** The owner's alert: the submission under the form's labels, answered by
   * replying to who sent it. */
  private async send(
    context: ServicePluginContext,
    records: FormRecords<E>,
    form: FormDefinition,
    id: string,
    idempotencyKey: string,
  ): Promise<FormAlertOutcome> {
    const inbox = this.inboxUrl(context);
    if (!inbox) return { sent: false, failure: "no-inbox" };
    const alert = await records.alert(id, form);
    if (!alert) return { sent: false, failure: "no-record" };
    const result = await context.messaging.request(notificationsSendContract, {
      title: form.notify.title,
      body: formAlertText({
        answers: alert.answers,
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
        this.serve(this.forms.get(definition.id), request, transport);
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
        const form = this.claimed.get(path);
        return (
          form !== undefined &&
          (method === "GET" || path === form.definition.path)
        );
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
    form: RunningForm | undefined,
    request: Request,
    transport?: WebRouteTransportContext,
  ): Promise<Response> {
    if (!form) return new Response("Not found", { status: 404 });
    if (!this.readyState || !(await this.maintenanceFresh()))
      return form.http.unavailable(request);
    return form.http.handle(request, transport);
  }

  /** Every form whose submissions may still need work in this process. */
  private running(): RunningForm[] {
    return [...this.forms.values(), ...this.retired.values()];
  }

  async ready(context: ServicePluginContext): Promise<void> {
    // A separate worker never serves the forms, so it is never ready to.
    if (context.executionOnly || this.forms.size === 0) return;
    if (!context.plugins.has("unified-inbox") || !this.inboxUrl(context))
      throw new Error(`${this.label} Inbox unavailable`);
    await this.readSiteTheme(context);
    await this.refresh();
    await this.maintain(this.stop.signal);
    this.stop.signal.throwIfAborted();
    this.readyState = true;
  }

  /** Where the alerts point: the unified-inbox workspace under Studio's
   * mounted workspaces route, on the forms' origin. Nothing while Studio
   * mounts no such route. */
  private inboxUrl(context: ServicePluginContext): string | undefined {
    const origin = this.policy?.http.origin;
    const workspaces = context.webRoutes.findByRole("studio-workspaces");
    return origin && workspaces
      ? `${origin}${workspaces.fullPath}/unified-inbox%3Ainbox`
      : undefined;
  }

  /** A form opens in the site's own theme when a link names none. */
  private async readSiteTheme(context: ServicePluginContext): Promise<void> {
    const result = await context.messaging.request(siteMetadataContract, {});
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
    for (const unregister of this.unregister.splice(0)) unregister();
    await this.maintenance?.catch(() => {
      // The initiating lifecycle/check caller received the sanitized failure;
      // shutdown still drains the owned work after aborting it.
    });
  }
}

import {
  defineServicePlugin,
  defineJob,
  defineRoute,
  defineSubscription,
  verbatim,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import {
  NOTIFICATIONS_SEND,
  notificationFailureCode,
  sendNotificationSchema,
  sendNotificationResultSchema,
  inboxWorkspaceRequest,
  contactFormDiscoveryRequest,
} from "@brains/contracts";
import {
  SITE_METADATA_GET_CHANNEL,
  SITE_METADATA_UPDATED_CHANNEL,
} from "@brains/site-composition";
import { ContactInboxSource } from "./inbox-source";
import { ContactAdmission } from "./admission";
import { ContactIntake } from "./intake";
import { ContactHttpHandlers } from "./http";
import { ContactDelivery, type ContactAlertOutcome } from "./delivery";
import { ContactStorageSlots } from "./storage-slots";
import { contactPluginConfigSchema } from "./config";
import { contactRequest } from "./entity/plugin";
import { contactRequestSchema } from "./entity/schema";
import { ContactRuntime, maintenanceStatusSchema } from "./runtime";

const contactRoutes = [
  { path: "/contact", method: "GET" },
  { path: "/contact", method: "POST" },
  { path: "/contact/thanks", method: "GET" },
] as const;

// Select only presentation data; malformed/missing metadata cannot grant access.
const siteThemeSchema = z.object({
  themeMode: z.enum(["light", "dark"]).optional(),
});
const siteThemeRequest = {
  topic: SITE_METADATA_GET_CHANNEL,
  payload: z.strictObject({}),
  response: z.unknown(),
};

const notificationJobSchema = z.strictObject({
  id: z.string().regex(/^contact-[a-f0-9]{64}$/),
});
// The existing message-envelope request supports authored refusals. Select only
// bounded codes from it; never store or expose arbitrary response errors.
const notificationReplySchema = z.object({
  success: z.boolean().optional(),
  noop: z.boolean().optional(),
  error: z.string().max(120).optional(),
  data: sendNotificationResultSchema.optional(),
});

/** Default-off intake; all writes and durable state remain package-owned. */
export function contactService(): ServicePackageDefinition<
  typeof contactPluginConfigSchema
> {
  return defineServicePlugin(
    {
      id: "contact",
      config: contactPluginConfigSchema,
      entities: [contactRequest],
      dependsOn: (config) => [
        "@brains/contact:contact-request",
        ...(config.intake
          ? [
              "@brains/notifications:notifications",
              "@brains/studio:studio",
              "@brains/unified-inbox:unified-inbox",
            ]
          : []),
      ],
      setup: ({
        config,
        entities,
        runtimeState,
        messaging,
        jobs,
        permissions,
        themeCSS,
        identity,
        previewUrl,
        lifecycle,
      }) => {
        const inbox = new ContactInboxSource({
          entityService: entities,
          permissions,
        });
        const presentation: { theme: "light" | "dark" | undefined } = {
          theme: undefined,
        };
        const intakeConfig = config.intake;
        if (!intakeConfig)
          return {
            inbox,
            presentation,
            runtime: undefined,
            delivery: undefined,
            notify: undefined,
          };
        const state = { scoped: runtimeState };
        const notify = defineJob({
          name: "notify",
          input: notificationJobSchema,
          output: z.enum(["sent", "failed", "skipped"]),
          deadline: "60s",
          retry: { attempts: intakeConfig.delivery.maxAttempts + 1 },
          oncePending: ({ id }) => `contact-notification:${id}`,
        });
        const delivery = new ContactDelivery({
          entities,
          state,
          storage: intakeConfig.storage,
          policy: intakeConfig.delivery,
          send: async (idempotencyKey): Promise<ContactAlertOutcome> => {
            const reply = await messaging.request({
              type: NOTIFICATIONS_SEND,
              payload: sendNotificationSchema.parse({
                title: "New contact request",
                body: `A contact request is saved in your authenticated Inbox.\n\n${intakeConfig.inboxUrl}`,
                sensitivity: "secret",
                idempotencyKey,
              }),
            });
            const parsed = notificationReplySchema.safeParse(reply);
            if (!parsed.success) return { sent: false, failure: "unconfirmed" };
            const result = parsed.data;
            if (result.noop) return { sent: false, failure: "no-notifier" };
            if (!result.success)
              return {
                sent: false,
                failure: notificationFailureCode(result.error),
              };
            return result.data?.status === "sent"
              ? { sent: true }
              : { sent: false, failure: "unconfirmed" };
          },
        });
        const admission = new ContactAdmission(state, intakeConfig.admission);
        const intake = new ContactIntake({
          admission,
          entities,
          state,
          policy: intakeConfig.storage,
          enqueueNotification: async (id): Promise<void> => {
            await jobs.enqueue(notify, { id });
          },
        });
        const runtime = new ContactRuntime(
          intakeConfig,
          intake,
          new ContactHttpHandlers(admission, intake, intakeConfig.http, {
            themeCSS,
            previewOrigin: intakeConfig.preview ? previewUrl : undefined,
            owner: (): string => identity.getProfile().name,
            defaultTheme: (): "light" | "dark" | undefined =>
              presentation.theme,
          }),
          new ContactStorageSlots(state, intakeConfig.storage, Date.now),
          runtimeState({
            namespace: "contact.maintenance",
            schema: maintenanceStatusSchema,
          }),
          async (id) =>
            (
              await entities.getEntity(
                {
                  entityType: "contact-request",
                  id,
                  visibilityScope: "restricted",
                },
                contactRequestSchema,
              )
            )?.metadata.status === "new",
        );
        lifecycle.onCleanup(() => runtime.shutdown());
        return { inbox, runtime, delivery, notify, presentation };
      },
    },
    {
      jobs: ({ state }) => {
        const { notify, delivery } = state;
        return notify
          ? [
              notify.handle(({ input, signal }) =>
                delivery.deliver(input.id, signal),
              ),
            ]
          : [];
      },
      checks: ({ state }) =>
        state.runtime
          ? [
              {
                id: "maintenance",
                cadence: "daily",
                deliverAlerts: false,
                includeInInbox: false,
                run: async ({ signal }): Promise<Record<string, never>> => {
                  await state.runtime.maintain(signal);
                  return {};
                },
              },
            ]
          : [],
      subscriptions: ({ config, state }) => {
        const intake = config.intake;
        return intake
          ? [
              defineSubscription({
                topic: SITE_METADATA_UPDATED_CHANNEL,
                payload: z.unknown(),
                handle: ({ payload }) => {
                  state.presentation.theme =
                    siteThemeSchema.safeParse(payload).data?.themeMode;
                },
              }),
              defineSubscription({
                execution: "all-roles",
                ...contactFormDiscoveryRequest,
                handle: () => ({
                  origin: intake.http.origin,
                  routes: contactRoutes.map((route) => ({
                    ...route,
                    public: true,
                    preview: intake.preview === true,
                  })),
                }),
              }),
            ]
          : [];
      },
      inbox: ({ state }) => ({
        sourceId: state.inbox.sourceId,
        displayName: state.inbox.displayName,
        list: () => state.inbox.list(),
        resolveDetail: (_context, id, actor, signal) =>
          state.inbox.resolveDetail(id, actor, signal),
        act: (_context, id, action, actor) =>
          state.inbox.act(id, action, actor),
      }),
      routes: ({ config, state }) => {
        const runtime = state.runtime;
        return runtime && config.intake
          ? contactRoutes.map((route) =>
              defineRoute({
                ...route,
                security: { kind: "public" },
                preview: config.intake?.preview,
                response: verbatim,
                handle: ({ request, transport }) =>
                  runtime.handle(request, transport),
              }),
            )
          : [];
      },
      ready: async ({ state, messaging }) => {
        if (!state.runtime) return;
        const destination = await messaging.request(inboxWorkspaceRequest, {});
        try {
          const response = await messaging.request(siteThemeRequest, {});
          if (response.ok)
            state.presentation.theme = siteThemeSchema.safeParse(response.data)
              .data?.themeMode;
        } catch {
          // No readable site theme: retain the form's default presentation.
        }
        await state.runtime.ready(
          destination.ok ? destination.data.href : undefined,
        );
      },
      health: ({
        state,
      }): Readonly<Record<string, ContactRuntime["health"]>> => {
        const runtime = state.runtime;
        return runtime ? { intake: () => runtime.health() } : {};
      },
      interactions: ({ config }) =>
        config.intake
          ? [
              {
                id: "contact",
                label: "Contact",
                href: `${config.intake.http.origin}/contact`,
                kind: "human",
                priority: 50,
                visibility: "public",
              },
            ]
          : [],
    },
  );
}
const contactPackage: ServicePackageDefinition<
  typeof contactPluginConfigSchema
> = contactService();
export default contactPackage;

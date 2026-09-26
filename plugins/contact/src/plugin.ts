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
  sendNotificationSchema,
  sendNotificationResultSchema,
  inboxWorkspaceRequest,
  contactFormDiscoveryRequest,
} from "@brains/contracts";
import { ContactInboxSource } from "./inbox-source";
import { ContactAdmission } from "./admission";
import { ContactIntake } from "./intake";
import { ContactHttpHandlers } from "./http";
import { ContactDelivery } from "./delivery";
import { ContactStorageSlots } from "./storage-slots";
import { contactPluginConfigSchema } from "./config";
import { contactRequest } from "./entity/plugin";
import { ContactRuntime, maintenanceStatusSchema } from "./runtime";

const contactRoutes = [
  { path: "/contact", method: "GET" },
  { path: "/contact", method: "POST" },
  { path: "/contact/thanks", method: "GET" },
] as const;

const notificationJobSchema = z.strictObject({
  id: z.string().regex(/^contact-[a-f0-9]{64}$/),
});
const notificationRequest = {
  topic: NOTIFICATIONS_SEND,
  payload: sendNotificationSchema,
  response: sendNotificationResultSchema,
};

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
        const intakeConfig = config.intake;
        if (!intakeConfig)
          return {
            inbox,
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
          send: async (idempotencyKey): Promise<boolean> => {
            const result = await messaging.request(notificationRequest, {
              title: "New contact request",
              body: `A contact request is saved in your authenticated Inbox.\n\n${intakeConfig.inboxUrl}`,
              sensitivity: "secret",
              idempotencyKey,
            });
            return result.ok && result.data.status === "sent";
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
          }),
          new ContactStorageSlots(state, intakeConfig.storage, Date.now),
          runtimeState({
            namespace: "contact.maintenance",
            schema: maintenanceStatusSchema,
          }),
        );
        lifecycle.onCleanup(() => runtime.shutdown());
        return { inbox, runtime, delivery, notify };
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
      subscriptions: ({ config }) => {
        const intake = config.intake;
        return intake
          ? [
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

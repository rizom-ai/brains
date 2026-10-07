import { createElement, type ReactElement } from "react";
import { SITE_SLOT_ATTRIBUTE } from "@brains/sdk/interfaces";
import {
  defineServicePlugin,
  defineJob,
  defineRoute,
  defineSubscription,
  verbatim,
  z,
  type ServicePackageDefinition,
  type ServicePublisher,
  type ServiceTemplateDefinition,
} from "@brains/sdk/services";
import {
  NOTIFICATIONS_SEND,
  SITE_BUILDER_CHANNELS,
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
import { contactInbox } from "./inbox-source";
import { ContactAdmission } from "./admission";
import { ContactIntake } from "./intake";
import { ContactHttpHandlers, previewOriginFor } from "./http";
import { CONTACT_SLOT } from "./http-page";
import { ContactDelivery, type ContactAlertOutcome } from "./delivery";
import { ContactStorageSlots } from "./storage-slots";
import { contactPluginConfigSchema, resolveIntakePolicy } from "./config";
import { contactRequest } from "./entity/plugin";
import { contactRequestSchema } from "./entity/schema";
import {
  ContactRuntime,
  contactInboxUrl,
  maintenanceStatusSchema,
} from "./runtime";

const contactRoutes = [
  { path: "/contact", method: "GET" },
  { path: "/contact", method: "POST" },
  { path: "/contact/thanks", method: "GET" },
] as const;

function ContactSlot(): ReactElement {
  return createElement("div", { [SITE_SLOT_ATTRIBUTE]: CONTACT_SLOT });
}

async function registerSitePages(messaging: ServicePublisher): Promise<void> {
  await messaging.publish({
    topic: SITE_BUILDER_CHANNELS.routeRegister,
    data: {
      pluginId: "@brains/contact:contact",
      routes: [
        { id: "contact", path: "/contact", title: "Contact" },
        { id: "contact-thanks", path: "/contact/thanks", title: "Note saved" },
      ].map((route) => ({
        ...route,
        sections: [
          { id: "form", template: "@brains/contact:contact:page", content: {} },
        ],
        navigation: { show: false },
      })),
    },
  });
}

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

/** Installed Contact serves its own policy; writes and state stay package-owned. */
export function contactService(): ServicePackageDefinition<
  typeof contactPluginConfigSchema
> {
  return defineServicePlugin(
    {
      id: "contact",
      config: contactPluginConfigSchema,
      entities: [contactRequest],
      dependsOn: [
        "@brains/contact:contact-request",
        "@brains/notifications:notifications",
        "@brains/studio:studio",
        "@brains/unified-inbox:unified-inbox",
      ],
      setup: ({
        config,
        entities,
        runtimeState,
        messaging,
        jobs,
        themeCSS,
        identity,
        previewUrl,
        siteUrl,
        localSiteUrl,
        preferLocalUrls,
        lifecycle,
      }) => {
        const presentation: { theme: "light" | "dark" | undefined } = {
          theme: undefined,
        };
        const origin =
          (preferLocalUrls ? localSiteUrl : siteUrl) ?? localSiteUrl ?? siteUrl;
        if (!origin)
          throw new Error("Contact intake needs the brain's site URL");
        const intakeConfig = resolveIntakePolicy(config, origin);
        const state = { scoped: runtimeState };
        lifecycle.onRegistered(() => registerSitePages(messaging));
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
            const destination = await messaging.request({
              type: inboxWorkspaceRequest.topic,
              payload: {},
            });
            const parsedDestination = z
              .object({
                success: z.literal(true),
                data: inboxWorkspaceRequest.response,
              })
              .safeParse(destination);
            const inboxUrl = contactInboxUrl(
              origin,
              parsedDestination.success
                ? parsedDestination.data.data.href
                : undefined,
            );
            if (!inboxUrl) return { sent: false, failure: "no-inbox" };
            const reply = await messaging.request({
              type: NOTIFICATIONS_SEND,
              payload: sendNotificationSchema.parse({
                title: "New contact request",
                body: `A contact request is saved in your authenticated Inbox.\n\n${inboxUrl}`,
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
            previewOrigin: previewOriginFor(
              intakeConfig.http.origin,
              previewUrl,
            ),
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
        return { runtime, delivery, notify, presentation, intakeConfig };
      },
    },
    {
      templates: (): Record<string, ServiceTemplateDefinition<z.ZodType>> => ({
        page: {
          schema: z.strictObject({}),
          permission: "public",
          description: "The site's contact page around a per-request form slot",
          render: ContactSlot,
        },
      }),
      jobs: ({ state }) => {
        const { notify, delivery } = state;
        return [
          notify.handle(({ input, signal }) =>
            delivery.deliver(input.id, signal),
          ),
        ];
      },
      checks: ({ state }) => [
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
      ],
      subscriptions: ({ state }) => {
        const intake = state.intakeConfig;
        return [
          defineSubscription({
            execution: "all-roles",
            topic: SITE_BUILDER_CHANNELS.routesCollect,
            payload: z.strictObject({}),
            handle: ({ messaging }) => registerSitePages(messaging),
          }),
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
                preview: true,
              })),
            }),
          }),
        ];
      },
      inbox: () => contactInbox,
      routes: ({ state }) =>
        contactRoutes.map((route) =>
          defineRoute({
            ...route,
            security: { kind: "public" },
            preview: true,
            response: verbatim,
            handle: ({ request, transport }) =>
              state.runtime.handle(request, transport),
          }),
        ),
      ready: async ({ state, messaging }) => {
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
        return { intake: () => runtime.health() };
      },
      interactions: ({ state }) => [
        {
          id: "contact",
          label: "Contact",
          href: `${state.intakeConfig.http.origin}/contact`,
          kind: "human",
          priority: 50,
          visibility: "public",
        },
      ],
    },
  );
}
const contactPackage: ServicePackageDefinition<
  typeof contactPluginConfigSchema
> = contactService();
export default contactPackage;

import { z } from "@brains/utils/zod";

/**
 * The host markup a site renders for the shared Web Chat box. The site owns
 * its frame and copy; Web Chat's boot script, served at ASK_BOX_SCRIPT_PATH
 * only while guest chat is enabled, enhances every host on the page.
 *
 * - ASK_BOX_ATTRIBUTE marks the element the box mounts into; it holds the
 *   draft `textarea`, rendered disabled until the boot enables it.
 * - ASK_SEND_ATTRIBUTE marks the send button, also rendered disabled.
 * - ASK_STATUS_ATTRIBUTE marks a `role="status"` line for connection notices.
 * - ASK_STYLED_ATTRIBUTE, on the mount element or an ancestor, opts into Web
 *   Chat's shared presentation of the mounted box. It is themed by `--ask-*`
 *   tokens, set on that same element, that default to the site theme; any
 *   host rule overrides it. Without it the host styles the whole box itself.
 */
export const ASK_BOX_ATTRIBUTE = "data-ask-box";
export const ASK_SEND_ATTRIBUTE = "data-ask-send";
export const ASK_STATUS_ATTRIBUTE = "data-ask-status";
export const ASK_STYLED_ATTRIBUTE = "data-ask-styled";
export const ASK_BOX_SCRIPT_PATH = "/ask/assets/box.js";

/**
 * Where Web Chat records, in shared runtime state, whether this deployment
 * serves the box boot (and on preview). Site builds may run in a separate
 * worker, where interfaces are not registered and Web Chat's routes are
 * absent; they read this record instead. The serving process writes it on
 * every start.
 */
export const ASK_BOX_STATE_NAMESPACE = "web-chat.ask-box";
export const ASK_BOX_STATE_KEY = "availability";
export const askBoxAvailabilitySchema: z.ZodObject<{
  public: z.ZodBoolean;
  preview: z.ZodBoolean;
}> = z.object({ public: z.boolean(), preview: z.boolean() });
export type AskBoxAvailability = z.output<typeof askBoxAvailabilitySchema>;

/**
 * Dispatched on the host (bubbling) once an answer completes: which public
 * sources it drew on, keyed `entityType:entityId`. A host page may use it,
 * for example to show where those sources sit; it never affects the box.
 * Each source the mounted box lists carries ASK_SOURCE_ATTRIBUTE with the
 * same key, so a host can point at it.
 */
export const ASK_SOURCES_EVENT = "ask:sources";
export const ASK_SOURCE_ATTRIBUTE = "data-ask-source";

export const askSourcesDetailSchema: z.ZodObject<{
  sources: z.ZodArray<z.ZodObject<{ id: z.ZodString; title: z.ZodString }>>;
}> = z.object({
  sources: z.array(z.object({ id: z.string(), title: z.string() })),
});
export type AskSourcesDetail = z.output<typeof askSourcesDetailSchema>;

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
 * - ASK_READY_ATTRIBUTE is set on the host by the boot once its controls are
 *   live, so a host may keep the box out of sight until then.
 * - ASK_STYLED_ATTRIBUTE, on the mount element or an ancestor, opts into Web
 *   Chat's shared presentation of the mounted box. It is themed by `--ask-*`
 *   tokens, set on that same element, that default to the site theme; any
 *   host rule overrides it. Without it the host styles the whole box itself.
 */
export const ASK_BOX_ATTRIBUTE = "data-ask-box";
export const ASK_SEND_ATTRIBUTE = "data-ask-send";
export const ASK_STATUS_ATTRIBUTE = "data-ask-status";
export const ASK_READY_ATTRIBUTE = "data-ask-ready";
export const ASK_STYLED_ATTRIBUTE = "data-ask-styled";
export const ASK_BOX_SCRIPT_PATH = "/ask/assets/box.js";

/**
 * Where Web Chat records, in shared runtime state, whether this deployment
 * serves the box boot publicly and on preview: a configured guest policy
 * everywhere, managed guest chat on preview once the owner has activated it.
 * Site builds may run in a separate worker, where interfaces are not
 * registered and Web Chat's routes are absent; they read this record instead.
 * The serving process writes it on every start and activation change.
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

/**
 * On a narrow screen the box opens full screen once the visitor engages, so
 * the keyboard never covers it and the answer never grows out of view.
 *
 * - ASK_SHEET_MEDIA is the media query below which the box does so.
 * - ASK_SHEET_ATTRIBUTE is set on the host while the box is open full screen.
 * - ASK_KEYBOARD_ATTRIBUTE is set on the host while the on-screen keyboard
 *   takes part of the screen; the box then fits the space above it.
 * - The open box has no title row: its conversation starts at the top of the
 *   screen, with a close button over its corner. A host may dock something
 *   at the top of the conversation, such as a map of its own content, in
 *   ASK_DOCK_ATTRIBUTE, and set `--ask-sheet-inset` on the host to its
 *   height so an answer opens below it.
 */
export const ASK_SHEET_MEDIA = "(max-width: 47.99rem)";
export const ASK_SHEET_ATTRIBUTE = "data-ask-sheet";
export const ASK_KEYBOARD_ATTRIBUTE = "data-ask-keyboard";

/**
 * Set by a host on its mount element: whose brain the box speaks for, such
 * as "Yeehaa". The box titles its conversation, labels its answers and says
 * where they come from with it; without it the box speaks as "the brain".
 */
export const ASK_NAME_ATTRIBUTE = "data-ask-name";

/**
 * Set by a host on its mount element: what the empty box asks for, in the
 * site's own words, such as "Ask about my work…". After the first answer the
 * box asks for a follow-up.
 */
export const ASK_PLACEHOLDER_ATTRIBUTE = "data-ask-placeholder";

/**
 * The key an open sheet marks its history entry with, holding the page's
 * scroll position. A page loaded on such an entry (a reload with the sheet
 * open) steps back off it and returns to that position.
 */
export const ASK_SHEET_HISTORY_KEY = "askSheet";

/**
 * Set by the box on its host, beside ASK_SHEET_ATTRIBUTE, while a closing
 * sheet falls away. A host that moves its own parts with the sheet (such as a
 * map docked under its header) moves them out with it; the sheet closes when
 * its own animation ends, or at once when it has none.
 */
export const ASK_CLOSING_ATTRIBUTE = "data-ask-closing";

/**
 * Rendered by the box, empty, as the first item of its conversation's
 * scroll. A host may put its own element there while the box is open full
 * screen (such as a map under the header) and take it back when it closes;
 * the element then scrolls with the conversation, and the box never touches
 * it. The host styles it, and sets `--ask-sheet-inset` to its height so an
 * answer opens below it.
 */
export const ASK_DOCK_ATTRIBUTE = "data-ask-dock";

/**
 * Set on the document's root element while an open sheet holds the page
 * still, to the page's scroll position. The page is pinned in place there
 * (Safari scrolls a page whose root only hides its overflow) and goes back
 * to that position when the sheet closes. Whoever opens the sheet first,
 * the boot or the box, sets it; the box clears it on close.
 */
export const ASK_PAGE_LOCK_ATTRIBUTE = "data-ask-locked";

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
 * serves the box boot publicly and on preview: on both, for a configured guest
 * policy or once the owner has switched guest chat on.
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
/** The brain whose published memory a source came from: its name, and its address when it has one. */
export const sourceBrainSchema: z.ZodObject<{
  name: z.ZodString;
  url: z.ZodOptional<z.ZodString>;
}> = z.object({
  name: z.string().trim().min(1).max(200),
  url: z.string().url().optional(),
});
export type SourceBrain = z.output<typeof sourceBrainSchema>;

/**
 * "Rizom, with Becca and Jo": who answered, then the brains whose published
 * memory the answer drew on, each once, in arrival order.
 */
export function answeredBy(owner: string, brains: readonly string[]): string {
  const names = brains.filter((name, i) => brains.indexOf(name) === i);
  if (names.length === 0) return owner;
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${owner}, with ${list}`;
}

export const ASK_SOURCES_EVENT = "ask:sources";
export const ASK_SOURCE_ATTRIBUTE = "data-ask-source";

export const askSourcesDetailSchema: z.ZodObject<{
  sources: z.ZodArray<
    z.ZodObject<{
      id: z.ZodString;
      title: z.ZodString;
      brain: z.ZodOptional<typeof sourceBrainSchema>;
    }>
  >;
}> = z.object({
  sources: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      // The brain whose published memory the source came from, when not this brain's own.
      brain: sourceBrainSchema.optional(),
    }),
  ),
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
 * While an open sheet covers the page, the page is hidden, and a style
 * element carrying ASK_COVER_ATTRIBUTE holds ASK_COVER_STYLE: hidden is not
 * enough for a blurred element such as a frosted sticky header, whose blur
 * Safari still paints, so blur is switched off everywhere but the sheet.
 */
export const ASK_COVER_ATTRIBUTE = "data-ask-cover";
export const ASK_COVER_STYLE: string = `body *:not([${ASK_SHEET_ATTRIBUTE}], [${ASK_SHEET_ATTRIBUTE}] *) { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }`;

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

/**
 * The Ask room: a page section that presents the box beside a drawing of
 * what an answer may cite (a map of pieces, a network of brains). The room
 * script (@brains/site-atlas) runs on every root; the page supplies the
 * parts by attribute and reacts to the room's events.
 *
 * - The root holds the box, the drawing and the lead layer.
 * - A mark is a drawing's element for one thing an answer may cite; its
 *   value is its key. A source cites a mark whose key is the source's id or
 *   its brain's address (the host of its url); a brain without an address
 *   cites a mark whose label (an `aria-label` on or in it) is its name.
 * - The drawing is the element lent to an open sheet's dock, a slot holding
 *   its place meanwhile; leads run only to its marks.
 * - The lead layer is an svg the room draws into, in its own frame.
 * - A mark's aim is the control in it that brings its listed source into
 *   view in the open conversation; a mark without one is its own aim.
 * - The column is the room's text column, which scrolls within the screen
 *   beside the drawing on a wide screen.
 */
export const ASK_ROOM_ATTRIBUTE = "data-ask-room";
export const ASK_COLUMN_ATTRIBUTE = "data-ask-column";
export const ASK_MARK_ATTRIBUTE = "data-ask-mark";
export const ASK_DRAWING_ATTRIBUTE = "data-ask-drawing";
export const ASK_LEADS_ATTRIBUTE = "data-ask-leads";
export const ASK_SLOT_ATTRIBUTE = "data-ask-slot";
export const ASK_AIM_ATTRIBUTE = "data-ask-aim";
/** Set on each mark an answer cites, while it does. */
export const ASK_CITED_ATTRIBUTE = "data-ask-cited";
/** Set for a moment on a listed source brought into view by its mark. */
export const ASK_FLASH_ATTRIBUTE = "data-ask-flash";
/**
 * Dispatched on the root after an answer's sources are matched to marks:
 * `detail.sources` as the box gave them, `detail.cited` one entry per
 * source that found marks ({ source, key, marks }), `detail.marks` every
 * cited mark once, `detail.unmatched` the sources that found none.
 */
export const ASK_CITED_EVENT = "ask:cited";
/** Dispatched on the root when the drawing is lent to the open sheet's dock, and when it is back. */
export const ASK_LENT_EVENT = "ask:lent";
export const ASK_RETURNED_EVENT = "ask:returned";
/** Dispatched on the root when a mark's aim brought its source into view: `detail.mark`, `detail.source` (the listed row). */
export const ASK_AIMED_EVENT = "ask:aimed";

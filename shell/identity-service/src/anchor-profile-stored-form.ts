import {
  StructuredContentFormatter,
  type FieldMapping,
} from "@brains/content-formatters";
import { z } from "@brains/utils/zod";

/*
 * The anchor profile's next stored form (docs/plans/one-stored-form.md):
 * its short facts in the header; its prose (description, intro, purpose,
 * mission, current focus, availability), its working principles and its
 * links as body sections; and the free text the current form keeps as its
 * body, its story, under a closing "## Story" that may hold any markdown.
 * A field the profile does not have is left out.
 */

/** The header keys the next form states in the body, in its order. */
export const PROFILE_BODY_FIELDS = [
  "description",
  "intro",
  "purpose",
  "mission",
  "currentFocus",
  "availability",
  "workingPrinciples",
  "socialLinks",
] as const;

const MOVED: ReadonlySet<string> = new Set(PROFILE_BODY_FIELDS);

/** Every profile key in the order a file brought back to the header gives it. */
export const PROFILE_KEY_ORDER: readonly string[] = [
  "name",
  "organization",
  "role",
  "audience",
  "expertise",
  "description",
  "tagline",
  "intro",
  "purpose",
  "mission",
  "currentFocus",
  "availability",
  "workingPrinciples",
  "avatar",
  "photo",
  "website",
  "email",
  "socialLinks",
];

const STORY_HEADING = "## Story";
const FENCE = /^\s*(```|~~~)/u;
const LINK_ITEM = /^- \[((?:\\.|[^\]\\])+)\]\((\S+?) "([^"]+)"\)$/u;

const linkSchema = z.object({
  platform: z.string(),
  url: z.string(),
  label: z.string().optional(),
});

function escapeLinkText(text: string): string {
  return text.replace(/[\\[\]]/gu, (character) => `\\${character}`);
}

function formatLinks(value: unknown): string {
  return z
    .array(linkSchema)
    .parse(value)
    .map(
      (link) =>
        `- [${escapeLinkText(link.label ?? link.platform)}](${link.url} "${link.platform}")`,
    )
    .join("\n");
}

/** A link line back as a link; its text is its label unless it is the platform. */
function parseLinks(text: string): unknown[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const match = LINK_ITEM.exec(line.trim());
      if (!match) return { line };
      const [, rawText = "", url = "", platform = ""] = match;
      const label = rawText.replace(/\\([\\[\]])/gu, "$1");
      return { platform, url, ...(label !== platform && { label }) };
    });
}

const prose = (key: string, label: string): FieldMapping => ({
  key,
  label,
  type: "string",
});

const sectionsSchema = z.object({
  description: z.string().optional(),
  intro: z.string().optional(),
  purpose: z.string().optional(),
  mission: z.string().optional(),
  currentFocus: z.string().optional(),
  availability: z.string().optional(),
  workingPrinciples: z.array(z.string()).optional(),
  socialLinks: z.array(linkSchema).optional(),
});

const sections = new StructuredContentFormatter(sectionsSchema, {
  title: "",
  layout: "compact",
  mappings: [
    prose("description", "Description"),
    prose("intro", "Intro"),
    prose("purpose", "Purpose"),
    prose("mission", "Mission"),
    prose("currentFocus", "Current focus"),
    prose("availability", "Availability"),
    {
      key: "workingPrinciples",
      label: "Working principles",
      type: "array",
      itemType: "string",
    },
    {
      key: "socialLinks",
      label: "Links",
      type: "custom",
      formatter: formatLinks,
      parser: parseLinks,
    },
  ],
});

const LABELS: ReadonlySet<string> = new Set([
  "description",
  "intro",
  "purpose",
  "mission",
  "current focus",
  "availability",
  "working principles",
  "links",
  "story",
]);

/** The line a body's story heading sits on, outside code; none without one. */
function storyLine(lines: readonly string[]): number {
  return lines.reduce<{ fenced: boolean; at: number }>(
    (state, line, index) => {
      if (FENCE.test(line)) return { ...state, fenced: !state.fenced };
      return state.at < 0 && !state.fenced && line.trim() === STORY_HEADING
        ? { ...state, at: index }
        : state;
    },
    { fenced: false, at: -1 },
  ).at;
}

/**
 * A stored profile in either form, as the current form holds it: its
 * fields in the header and its story as the body. A body that does not
 * open on one of the next form's sections is the current form's story; a
 * field in the header is read over the section it replaces.
 */
export function profileInCurrentShape(
  header: Readonly<Record<string, unknown>>,
  body: string,
): { header: Record<string, unknown>; body: string } {
  const opening = body.split("\n").find((line) => line.trim() !== "") ?? "";
  const heading = /^## (.+)$/u.exec(opening)?.[1]?.trim().toLowerCase();
  if (heading === undefined || !LABELS.has(heading))
    return { header: { ...header }, body };
  const lines = body.split("\n");
  const at = storyLine(lines);
  const fieldText = (at < 0 ? lines : lines.slice(0, at)).join("\n");
  const story =
    at < 0
      ? ""
      : lines
          .slice(at + 1)
          .join("\n")
          .replace(/^\n+/u, "");
  try {
    const fields = fieldText.trim() === "" ? {} : sections.parse(fieldText);
    // A field update writes a field into the header: its value is the
    // fresh one, over the section it replaces.
    return { header: { ...fields, ...header }, body: story };
  } catch {
    // Sections an author wrote that are not the profile's are its story.
    return { header: { ...header }, body };
  }
}

/** A profile's next-form header and body, from its current-shape ones. */
export function profileInNextForm(
  header: Readonly<Record<string, unknown>>,
  story: string,
): { header: Record<string, unknown>; body: string } {
  const moved = Object.fromEntries(
    Object.entries(header).filter(
      ([key, value]) => MOVED.has(key) && value !== undefined && value !== null,
    ),
  );
  const written = sections.format(sectionsSchema.parse(moved));
  const text = story.replace(/\n+$/u, "");
  const storySection =
    text.trim() === "" ? "" : `${STORY_HEADING}\n\n${text}\n`;
  return {
    header: Object.fromEntries(
      Object.entries(header).filter(([key]) => !MOVED.has(key)),
    ),
    body: [written.replace(/\n+$/u, ""), storySection.replace(/\n+$/u, "")]
      .filter((part) => part.length > 0)
      .join("\n\n")
      .concat(written.length > 0 || storySection.length > 0 ? "\n" : ""),
  };
}

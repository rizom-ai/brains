import { z } from "@brains/utils/zod";
import { slugify } from "@brains/utils/string-utils";

export const guideStepLinkSchema: z.ZodObject<{
  label: z.ZodString;
  href: z.ZodString;
}> = z.object({ label: z.string(), href: z.string() });

export const guideStageSchema: z.ZodObject<{
  number: z.ZodNumber;
  id: z.ZodString;
  heading: z.ZodString;
  prose: z.ZodString;
  points: z.ZodArray<z.ZodString>;
  steps: z.ZodArray<typeof guideStepLinkSchema>;
}> = z.object({
  /** Position of the stage, from 1. */
  number: z.number().int().positive(),
  /** Anchor id, from the heading. */
  id: z.string(),
  heading: z.string(),
  /** The stage's markdown without its Exact steps line or closing list. */
  prose: z.string(),
  /** Items of a bullet list that closes the stage, as inline markdown. */
  points: z.array(z.string()),
  /** The docs named on the stage's `Exact steps:` line. */
  steps: z.array(guideStepLinkSchema),
});

export type GuideStepLink = z.output<typeof guideStepLinkSchema>;
export type GuideStage = z.output<typeof guideStageSchema>;

interface RawStage {
  heading: string;
  lines: string[];
}

interface SplitState {
  fenced: boolean;
  stages: RawStage[];
}

const STAGE_HEADING = /^##\s+(.+?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;
const STEPS_LINE = /^Exact steps:/;
const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const BULLET = /^[-*+]\s+/;

/** Split the body at `##` headings outside fenced code; text before the first is dropped. */
function splitStages(body: string): RawStage[] {
  return body.split("\n").reduce<SplitState>(
    (state, line) => {
      const fenced = FENCE.test(line) ? !state.fenced : state.fenced;
      const heading = state.fenced ? null : STAGE_HEADING.exec(line);
      if (heading?.[1]) {
        return {
          fenced,
          stages: [...state.stages, { heading: heading[1], lines: [] }],
        };
      }
      const current = state.stages.at(-1);
      if (!current) return { ...state, fenced };
      return {
        fenced,
        stages: [
          ...state.stages.slice(0, -1),
          { ...current, lines: [...current.lines, line] },
        ],
      };
    },
    { fenced: false, stages: [] },
  ).stages;
}

/** Blank-line separated blocks; a fenced block stays whole. */
function toBlocks(lines: string[]): string[] {
  return lines
    .reduce<{ fenced: boolean; blocks: string[][] }>(
      (state, line) => {
        const fenced = FENCE.test(line) ? !state.fenced : state.fenced;
        if (!state.fenced && line.trim() === "") {
          return { fenced, blocks: [...state.blocks, []] };
        }
        const last = state.blocks.at(-1) ?? [];
        return {
          fenced,
          blocks: [...state.blocks.slice(0, -1), [...last, line]],
        };
      },
      { fenced: false, blocks: [[]] },
    )
    .blocks.filter((block) => block.length > 0)
    .map((block) => block.join("\n"));
}

function isBulletList(block: string): boolean {
  return block.split("\n").every((line) => BULLET.test(line));
}

function stepLinks(block: string): GuideStepLink[] {
  return Array.from(block.matchAll(LINK), ([, label = "", href = ""]) => ({
    label,
    href,
  }));
}

function toStage(raw: RawStage, index: number): GuideStage {
  const blocks = toBlocks(raw.lines);
  const stepsBlock = blocks.filter((block) => STEPS_LINE.test(block)).at(-1);
  const content = blocks.filter((block) => block !== stepsBlock);
  const closing = content.at(-1);
  const points =
    closing !== undefined && isBulletList(closing)
      ? closing.split("\n").map((line) => line.replace(BULLET, ""))
      : [];
  const prose = points.length > 0 ? content.slice(0, -1) : content;

  return guideStageSchema.parse({
    number: index + 1,
    id: slugify(raw.heading),
    heading: raw.heading,
    prose: prose.join("\n\n"),
    points,
    steps: stepsBlock ? stepLinks(stepsBlock) : [],
  });
}

/**
 * Read a guide body as stages: each `##` heading opens one, running to the
 * next. A stage's `Exact steps:` line becomes its step links, and a bullet
 * list that closes the stage becomes its points; neither stays in the prose.
 */
export function parseGuideStages(body: string): GuideStage[] {
  return splitStages(body).map(toStage);
}

import type { ServiceAI } from "@brains/sdk/internal/service-runtime";
import { z } from "@brains/utils/zod";

/*
 * The chair's own turns: the two things the brain that holds a seminar
 * writes itself. It reads the openings and decides who stands and what each
 * of the others is asked, and it hands the challenges to the one who stood.
 * It never quotes for a participant: his own brain finds and quotes.
 */

/** A participant's turn as the chair reads it. */
export interface ChairReading {
  agent: string;
  name: string;
  text: string;
}

type ChairChallengeSchema = z.ZodObject<{
  stands: z.ZodString;
  reading: z.ZodString;
  followUps: z.ZodArray<
    z.ZodObject<{ agent: z.ZodString; followUp: z.ZodString }>
  >;
}>;

/** The chair's turn after the openings. */
export const chairChallengeSchema: ChairChallengeSchema = z.object({
  stands: z
    .string()
    .describe("The id of the participant whose opening stands, as given"),
  reading: z
    .string()
    .min(1)
    .describe(
      "Two or three sentences: who answered the question as asked, who answered beside it, and who stands",
    ),
  followUps: z
    .array(
      z.object({
        agent: z.string().describe("The id of the participant asked, as given"),
        followUp: z
          .string()
          .min(1)
          .describe(
            "One follow-up addressed to him: the claim he must answer and a work of his own to answer from",
          ),
      }),
    )
    .describe("One follow-up for every participant who does not stand"),
});

export type ChairChallenge = z.output<typeof chairChallengeSchema>;

const chairRejoinderSchema = z.object({
  followUp: z
    .string()
    .min(1)
    .describe(
      "One follow-up addressed to the one who stood: what each challenger answered, a work of his own to answer from, and the question how he answers them",
    ),
});

export interface ChairChallengeInput {
  question: string;
  language: string;
  openings: readonly ChairReading[];
}

export interface ChairRejoinderInput {
  question: string;
  language: string;
  stands: ChairReading;
  challenges: readonly ChairReading[];
}

/** The chair, as a seminar asks it for its turns. */
export interface SeminarChair {
  challenge(input: ChairChallengeInput): Promise<ChairChallenge>;
  rejoinder(input: ChairRejoinderInput): Promise<string>;
}

function turns(readings: readonly ChairReading[]): string {
  return readings
    .map(({ agent, name, text }) => `### ${name} (id: ${agent})\n\n${text}`)
    .join("\n\n");
}

const NEVER_QUOTE =
  "Never quote a participant's works for him and never supply his words: name the work, and his own brain finds and quotes the passage.";

function guided(guidance: string | undefined): string[] {
  return guidance ? ["What you know of the participants:", guidance, ""] : [];
}

export function chairChallengePrompt(
  input: ChairChallengeInput,
  guidance?: string,
): string {
  return [
    "You chair a seminar. One question was put to every participant, and each answered from his own works.",
    "Read the openings and decide who stands: the participant whose opening answers the question most directly. Every other participant must answer him.",
    "Write a reading of two or three sentences: who answered the question as asked, who answered beside it, and who stands.",
    "For every participant who does not stand, write one follow-up addressed to him: name the claim of the one who stands that he must answer, and a work of his own to answer from.",
    NEVER_QUOTE,
    `Write in ${input.language}; titles of works stay in their own language.`,
    "Use each participant's id exactly as given.",
    "",
    ...guided(guidance),
    `The question: ${input.question}`,
    "",
    "The openings:",
    "",
    turns(input.openings),
  ].join("\n");
}

export function chairRejoinderPrompt(
  input: ChairRejoinderInput,
  guidance?: string,
): string {
  return [
    "You chair a seminar. One participant's opening stood, and the others have answered him. He must now answer them.",
    "Write one follow-up addressed to him: say in a sentence what each challenger answered, name a work of his own to answer from, and ask how he answers them.",
    NEVER_QUOTE,
    `Write in ${input.language}; titles of works stay in their own language.`,
    "",
    ...guided(guidance),
    `The question: ${input.question}`,
    "",
    "The opening that stood:",
    "",
    turns([input.stands]),
    "",
    "The challenges:",
    "",
    turns(input.challenges),
  ].join("\n");
}

/**
 * The chair's turn must be one the seminar can run: the one who stands gave
 * an opening, and every other participant, and no one else, has one
 * follow-up.
 */
export function checkedChallenge(
  challenge: ChairChallenge,
  openings: readonly ChairReading[],
): ChairChallenge {
  const participants = openings.map(({ agent }) => agent);
  if (!participants.includes(challenge.stands))
    throw new Error(`${challenge.stands} gave no opening and cannot stand`);
  const others = participants.filter((agent) => agent !== challenge.stands);
  const asked = challenge.followUps.map(({ agent }) => agent);
  if (
    asked.length !== others.length ||
    others.some((agent) => !asked.includes(agent))
  ) {
    throw new Error(
      `The chair's follow-ups (${asked.join(", ")}) do not match the participants who answer (${others.join(", ")})`,
    );
  }
  // In the participants' order, whatever order the chair wrote them in.
  return {
    ...challenge,
    followUps: others.flatMap(
      (agent) => challenge.followUps.find((item) => item.agent === agent) ?? [],
    ),
  };
}

/** The chair over the brain's own model, with what the brain knows of its peers. */
export function modelChair(
  ai: Pick<ServiceAI, "generateObject">,
  guidance?: string,
): SeminarChair {
  return {
    challenge: async (input) =>
      (
        await ai.generateObject(
          chairChallengePrompt(input, guidance),
          chairChallengeSchema,
        )
      ).object,
    rejoinder: async (input) =>
      (
        await ai.generateObject(
          chairRejoinderPrompt(input, guidance),
          chairRejoinderSchema,
        )
      ).object.followUp,
  };
}

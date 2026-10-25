import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { Chapter } from "./chapter";

/**
 * 07, start here: three doors, for organizations, independents and
 * programs, over the field at rest around the lit hub (the field's `start`
 * scene). Each door goes where its content says.
 */
const startSchema = z.object({
  number: z.string(),
  label: z.string(),
  headline: z.string(),
  doors: z
    .array(
      z.object({
        audience: z.string(),
        title: z.string(),
        text: z.string(),
        action: z.string(),
        href: z.string(),
      }),
    )
    .length(3),
});

function StartSection({
  number,
  label,
  headline,
  doors,
}: z.infer<typeof startSchema>): JSX.Element {
  return (
    <Chapter
      id="start"
      scene="start"
      number={number}
      label={label}
      headline={headline}
      length="1.2"
      captions={{}}
      wide
    >
      <div className="hub-doors">
        {doors.map((door) => (
          <a className="hub-door" href={door.href} key={door.title}>
            <small>{door.audience}</small>
            <strong>{door.title}</strong>
            <span>{door.text}</span>
            <em>{door.action}</em>
          </a>
        ))}
      </div>
    </Chapter>
  );
}

export const start: SectionDefinition = defineSection(
  startSchema,
  StartSection,
  {
    title: "07 — Start here",
    description:
      "The three doors: for each, who it is for, its title, its words, the action and where it links.",
  },
);

export const startContent: JsonObject = {
  number: "07",
  label: "Start here",
  headline: "Bring a question, a practice or a *program*.",
  doors: [
    {
      audience: "For organizations",
      title: "Book a lab",
      text: "Six months, a team of four and one question of your own. You keep the Brain.",
      action: "Talk to the hub →",
      href: "https://rizom.ai/contact",
    },
    {
      audience: "For independents",
      title: "Join the practice",
      text: "Certify, deliver labs and build on your own Brain. €49 a month, free while you co-deliver your first lab.",
      action: "Become a member →",
      href: "https://rizom.ai/contact",
    },
    {
      audience: "For programs and partners",
      title: "Run a program here",
      text: "Bring your cohort to the hub, and keep what it learns after it ends.",
      action: "Plan a program →",
      href: "https://rizom.ai/contact",
    },
  ],
} satisfies z.input<typeof startSchema>;

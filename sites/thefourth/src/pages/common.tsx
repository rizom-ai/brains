import type { JSX, ReactNode } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type RouteDefinitionInput,
  type SectionDefinition,
} from "@rizom/site";
import { linkSchema, type Link } from "../home/links";

/**
 * What the inner pages share: an intro under a lit dot, the dark band that
 * asks for the next step, and the small pieces their sections are built
 * from (labels, chips, figures and case cards).
 */

/** The lights a dot, a chip or a bar comes in. */
export const lightSchema: z.ZodEnum<{
  red: "red";
  mint: "mint";
  mustard: "mustard";
  ink: "ink";
}> = z.enum(["red", "mint", "mustard", "ink"]);

export type Light = z.infer<typeof lightSchema>;

/** A chip's light: a world's chip is lit, a service's ("") is not. */
const chipLightSchema: z.ZodEnum<{
  "": "";
  red: "red";
  mint: "mint";
  mustard: "mustard";
  ink: "ink";
}> = z.enum(["", "red", "mint", "mustard", "ink"]);

/** A chip that leads somewhere: a world, a service. */
export const chipSchema: z.ZodObject<{
  label: z.ZodString;
  href: z.ZodString;
  light: z.ZodDefault<typeof chipLightSchema>;
}> = z.object({
  label: z.string(),
  href: z.string(),
  light: chipLightSchema.default(""),
});

export type Chip = z.infer<typeof chipSchema>;

/** A figure and what it counts; a line without a figure stands alone. */
export const statSchema: z.ZodObject<{
  value: z.ZodDefault<z.ZodString>;
  label: z.ZodString;
}> = z.object({ value: z.string().default(""), label: z.string() });

export type Stat = z.infer<typeof statSchema>;

/** A client's words and who said them. */
export const quoteSchema: z.ZodObject<{
  text: z.ZodString;
  by: z.ZodString;
}> = z.object({ text: z.string(), by: z.string() });

/** One piece of work: who it was for, what happened, the figures, a quote. */
export const caseSchema: z.ZodObject<{
  context: z.ZodString;
  story: z.ZodString;
  stats: z.ZodDefault<z.ZodArray<typeof statSchema>>;
  quote: z.ZodDefault<typeof quoteSchema>;
}> = z.object({
  context: z.string(),
  story: z.string(),
  stats: z.array(statSchema).default([]),
  quote: quoteSchema.default({ text: "", by: "" }),
});

export type Case = z.infer<typeof caseSchema>;

export function Dot({
  light,
  className,
}: {
  light: Light;
  className?: string;
}): JSX.Element {
  return (
    <span
      className={["tf-pdot", `tf-pdot--${light}`, className]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    />
  );
}

/** The small capitals over a group: "What we hear", "You get". */
export function Label({
  children,
  as: Tag = "span",
}: {
  children: ReactNode;
  as?: "span" | "h3";
}): JSX.Element {
  return <Tag className="tf-plabel">{children}</Tag>;
}

/** A pill that leads to a world or a service, its light beside it. */
export function ChipLink({ chip }: { chip: Chip }): JSX.Element {
  return (
    <a className="tf-tile" href={chip.href}>
      {chip.light && <Dot light={chip.light} />}
      {chip.label}
    </a>
  );
}

export function ChipRow({
  chips,
  label,
}: {
  chips: Chip[];
  label?: string;
}): JSX.Element {
  return label ? (
    <nav className="tf-tiles" aria-label={label}>
      {chips.map((chip) => (
        <ChipLink key={chip.href} chip={chip} />
      ))}
    </nav>
  ) : (
    <div className="tf-tiles">
      {chips.map((chip) => (
        <ChipLink key={chip.href} chip={chip} />
      ))}
    </div>
  );
}

/** The figures of a case, side by side. */
export function Stats({ stats }: { stats: Stat[] }): JSX.Element | null {
  if (stats.length === 0) return null;
  return (
    <div className="tf-stats">
      {stats.map((stat) => (
        <div key={stat.label} className="tf-stat">
          {stat.value && <span className="tf-stat__value">{stat.value}</span>}
          <span className="tf-stat__label">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}

/** A case on a white card: context in italics, the story, figures, a quote. */
export function CaseCard({ item }: { item: Case }): JSX.Element {
  return (
    <article className="tf-pcard tf-case">
      <span className="tf-case__context">{item.context}</span>
      <p className="tf-case__story">{item.story}</p>
      <Stats stats={item.stats} />
      {item.quote.text && (
        <figure className="tf-case__quote">
          <blockquote>{item.quote.text}</blockquote>
          <figcaption>{item.quote.by}</figcaption>
        </figure>
      )}
    </article>
  );
}

/** Words between asterisks set in the story's italics: "we help you *see*". */
export function Emphasized({ text }: { text: string }): JSX.Element {
  return (
    <>
      {text.split(/\*([^*]+)\*/).map((part, index) =>
        index % 2 === 1 ? (
          <em key={index} className="tf-em">
            {part}
          </em>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** A pill-shaped link, in one of the paper colors. */
export function Button({
  link,
  tone,
}: {
  link: Link;
  tone: "ink" | "mustard" | "red" | "card";
}): JSX.Element {
  return (
    <a className={`tf-btn tf-btn--${tone}`} href={link.href}>
      {link.label}
    </a>
  );
}

/** The inner pages' column: narrower than the stage. */
export function PageWrap({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={["tf-pwrap", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

/**
 * How an inner page opens: a lit dot and the page's name in italics, the
 * headline, the lede, and the chips that lead into the page when it has
 * them.
 */
const introSchema = z.object({
  light: lightSchema,
  eyebrow: z.string(),
  headline: z.string(),
  lede: z.string(),
  chipsLabel: z.string().default(""),
  chips: z.array(chipSchema).default([]),
});

function IntroSection({
  light,
  eyebrow,
  headline,
  lede,
  chipsLabel,
  chips,
}: z.infer<typeof introSchema>): JSX.Element {
  return (
    <section className="tf-intro">
      <PageWrap className="tf-intro__inner">
        <p className="tf-intro__eyebrow">
          <Dot light={light} />
          <span>{eyebrow}</span>
        </p>
        <h1 className="tf-intro__headline">{headline}</h1>
        <p className="tf-intro__lede">
          <Emphasized text={lede} />
        </p>
        {chips.length > 0 && (
          <ChipRow chips={chips} label={chipsLabel || eyebrow} />
        )}
      </PageWrap>
    </section>
  );
}

export const intro: SectionDefinition = defineSection(
  introSchema,
  IntroSection,
  {
    title: "Page intro",
    description:
      "How an inner page opens: its light (red, mint, mustard or ink), the page's name, the headline, the lede (words between asterisks in italics) and, optionally, chips leading into the page (each a label, a link and a light) under a name for screen readers.",
  },
);

/**
 * The dark band near a page's end: the next step in italics, the question,
 * an optional line under it and one mustard button.
 */
const nextStepSchema = z.object({
  eyebrow: z.string(),
  headline: z.string(),
  text: z.string().default(""),
  action: linkSchema,
});

function NextStepSection({
  eyebrow,
  headline,
  text,
  action,
}: z.infer<typeof nextStepSchema>): JSX.Element {
  return (
    <section className="tf-next">
      <PageWrap className="tf-next__inner">
        <p className="tf-next__eyebrow">{eyebrow}</p>
        <p className="tf-next__headline">{headline}</p>
        {text && <p className="tf-next__text">{text}</p>}
        <Button link={action} tone="mustard" />
      </PageWrap>
    </section>
  );
}

export const nextStep: SectionDefinition = defineSection(
  nextStepSchema,
  NextStepSection,
  {
    title: "Next step",
    description:
      "The dark band near a page's end: the italic line, the question, an optional sentence under it and the button (label and link).",
  },
);

/**
 * An inner page's route: its head, and each section's template with the
 * design's copy as the fallback until the brain saves its own at
 * site-content/<page>/<section>.md.
 */
export function pageRoute(
  page: { id: string; path: string; title: string; description: string },
  sections: Array<{ id: string; template: string; content: JsonObject }>,
): RouteDefinitionInput {
  return {
    ...page,
    layout: "default",
    navigation: { show: false },
    sections,
  };
}

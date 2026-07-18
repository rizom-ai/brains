/** @jsxImportSource preact */
import type { JSX, ComponentChildren } from "preact";
import { z } from "@rizom/site-sections";
import { Button, Section, renderHighlightedText } from "@rizom/site-rizom";

/**
 * Shared presentational primitives for the consolidated Rizom site — the
 * rev-5 chrome pieces every room reuses (section caption, CTA row, full-bleed
 * statement band, colophon line). Copy is content-driven via each page's
 * schema-first section group; these components only lay it out.
 */

/**
 * A `{ label, href }` link — the schema every CTA field reuses. The explicit
 * annotation is required because `--isolatedDeclarations` cannot infer an
 * exported const's type from `z.object(...)`.
 */
export const ctaSchema: z.ZodObject<{
  label: z.ZodString;
  href: z.ZodString;
}> = z.object({
  label: z.string(),
  href: z.string(),
});
export type CtaLink = z.infer<typeof ctaSchema>;

/* Rev-5 emphasis: italic Fraunces in the bright accent. */
export const HIGHLIGHT_CLS = "italic font-[395] text-accent-bright";
/* Room emphasis picks up the room accent instead. */
export const ROOM_HIGHLIGHT_CLS = "italic font-[400] text-accent";

/* The mockup's `.cap` section caption: mono, wide-tracked, a short
   accent tick leading in, optional lowercase trail note. The "cold" tone
   drains the accent — rev-10's withered section holds no warmth. */
export function SectCap({
  lead,
  trail,
  tone = "accent",
  className = "",
}: {
  lead: string;
  trail?: string | undefined;
  tone?: "accent" | "cold";
  className?: string;
}): JSX.Element {
  const cold = tone === "cold";
  return (
    <p
      className={`reveal flex flex-wrap items-baseline gap-3.5 font-label text-label-xs uppercase tracking-[0.2em] ${className}`}
    >
      {/* Tick and lead wrap as one unit — a long trail may drop to its
          own line, but the tick never orphans away from the lead. */}
      <span className="flex items-baseline gap-3.5">
        <span
          aria-hidden="true"
          className={`h-px w-[26px] self-center opacity-80 ${cold ? "bg-theme-light" : "bg-accent"}`}
        />
        <span
          className={`font-medium ${cold ? "text-theme-light" : "text-accent"}`}
        >
          {lead}
        </span>
      </span>
      {trail && (
        <span className="normal-case tracking-[0.1em] text-theme-light">
          {trail}
        </span>
      )}
    </p>
  );
}

export function CtaRow({
  primaryCta,
  secondaryCta,
  className = "",
}: {
  primaryCta: CtaLink;
  secondaryCta: CtaLink;
  className?: string;
}): JSX.Element {
  return (
    <div
      className={`flex flex-col gap-4 sm:flex-row sm:items-baseline sm:gap-[26px] ${className}`}
    >
      <Button href={primaryCta.href} variant="primary">
        {primaryCta.label}
      </Button>
      <Button href={secondaryCta.href} variant="secondary">
        {secondaryCta.label}
      </Button>
    </div>
  );
}

/* The `.band` full-bleed statement: display-italic blockquote over a
   soft wash, optional sub line and CTA row. */
export function Band({
  quote,
  children,
}: {
  quote: string;
  children?: ComponentChildren;
}): JSX.Element {
  return (
    <Section className="relative overflow-hidden py-[74px]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(640px_300px_at_78%_30%,var(--color-wash-a),transparent_68%)] opacity-50"
      />
      <div className="relative">
        <blockquote className="reveal max-w-[19em] font-display text-[clamp(30px,3.8vw,52px)] font-[405] italic leading-[1.18] tracking-[-0.015em] text-theme [font-variation-settings:'SOFT'_100,'opsz'_110]">
          {renderHighlightedText(quote, "text-accent-bright")}
        </blockquote>
        {children}
      </div>
    </Section>
  );
}

/* The journal `.index-row`: folio numeral, mono series key, display
   title with hover accent, trailing meta or arrow. */
export interface IndexRowData {
  no: string;
  kicker: string;
  title: string;
  text: string;
  href?: string | undefined;
  meta?: string | undefined;
  metaSub?: string | undefined;
}

export function IndexRow({
  row,
  delayClass = "",
}: {
  row: IndexRowData;
  delayClass?: string;
}): JSX.Element {
  const inner = (
    <>
      <span className="font-display text-[35px] font-light leading-none text-theme-light [font-variation-settings:'SOFT'_30]">
        {row.no}
      </span>
      <span className="font-label text-label-xs uppercase tracking-[0.1em] text-theme-light">
        {row.kicker}
      </span>
      {/* Below md the two-column grid is folio|kicker on the first row;
          title and meta take full-width rows of their own instead of
          falling into the 44px folio column. */}
      <span className="col-span-2 block md:col-span-1">
        <span className="block font-display text-[26px] font-[470] tracking-[-0.01em] text-theme transition-colors group-hover:text-accent [font-variation-settings:'SOFT'_75,'opsz'_60]">
          {row.title}
        </span>
        <span className="mt-1 block max-w-[56ch] font-body text-[15.5px] text-theme-light">
          {row.text}
        </span>
      </span>
      <span className="col-span-2 text-right font-label text-[12px] text-theme-light md:col-span-1">
        {row.meta ?? "→"}
        {row.metaSub && (
          <small className="block text-theme-light opacity-70">
            {row.metaSub}
          </small>
        )}
      </span>
    </>
  );

  const rowClass = `reveal ${delayClass} group grid grid-cols-[44px_1fr] items-baseline gap-x-6 gap-y-2 border-t border-theme-light py-6 no-underline md:grid-cols-[64px_176px_1fr_auto] md:gap-6`;

  return row.href ? (
    <a href={row.href} className={rowClass}>
      {inner}
    </a>
  ) : (
    <div className={rowClass}>{inner}</div>
  );
}

/* The `.alive-line` colophon: an italic claim followed by small mono
   proof links. */
export function AliveLine({
  claim,
  links,
}: {
  claim: string;
  links: CtaLink[];
}): JSX.Element {
  return (
    <Section className="flex flex-wrap items-baseline gap-[26px] py-10">
      <span className="reveal font-display text-[22px] font-[430] italic text-theme-muted [font-variation-settings:'SOFT'_90]">
        {renderHighlightedText(claim, "not-italic font-medium text-theme")}
      </span>
      {links.map((link, i) => (
        <a
          key={link.href + link.label}
          href={link.href}
          className={`reveal ${i > 0 ? "reveal-delay-1" : ""} -mt-2 inline-block border-b border-theme-light pt-2 font-label text-[12px] text-theme-light no-underline transition-colors hover:text-accent-bright`}
        >
          {link.label}
        </a>
      ))}
    </Section>
  );
}

const DELAY_CLASSES = ["", "reveal-delay-1", "reveal-delay-2"];

export function delayClass(index: number): string {
  return DELAY_CLASSES[index % DELAY_CLASSES.length] ?? "";
}

/* The three-up marker/title/text grid shared by two rooms: home's "why it
   has to exist" problem trio (large display numerals) and /brain's "your
   data, your rules" principles (mono markers). One schema, one component,
   the marker style toggled by `mono`; `withered` hollows the numerals and
   cools the titles — the rev-10 no-warmth treatment for the pain section. */
export const trioItemSchema: z.ZodObject<{
  marker: z.ZodString;
  title: z.ZodString;
  text: z.ZodString;
}> = z.object({
  marker: z.string(),
  title: z.string(),
  text: z.string(),
});

export const trioSchema: z.ZodObject<{
  cap: z.ZodString;
  capNote: z.ZodOptional<z.ZodString>;
  items: z.ZodArray<typeof trioItemSchema>;
}> = z.object({
  cap: z.string(),
  capNote: z.string().optional(),
  items: z.array(trioItemSchema),
});

export type TrioItem = z.infer<typeof trioItemSchema>;

export function Trio({
  items,
  mono,
  withered = false,
}: {
  items: TrioItem[];
  mono: boolean;
  withered?: boolean;
}): JSX.Element {
  const numeralClass = withered
    ? "block font-display text-[44px] font-light leading-none text-transparent [-webkit-text-stroke:1px_var(--color-text-light)] [font-variation-settings:'SOFT'_30,'opsz'_100]"
    : "block font-display text-[44px] font-light leading-none text-theme-light [font-variation-settings:'SOFT'_30,'opsz'_100]";
  return (
    <div className="mt-[30px] grid gap-11 md:grid-cols-3">
      {items.map((item, i) => (
        <div key={item.title} className={`reveal ${delayClass(i)}`}>
          {mono ? (
            <span className="inline-block pt-3 pb-[15px] font-label text-[14px] font-medium tracking-[0.1em] text-accent">
              {item.marker}
            </span>
          ) : (
            <span className={numeralClass}>{item.marker}</span>
          )}
          <b
            className={`mt-2.5 block font-display text-[21px] font-[520] tracking-[-0.006em] [font-variation-settings:'SOFT'_55] ${withered ? "text-theme-muted" : "text-theme"}`}
          >
            {item.title}
          </b>
          <p className="mt-2 font-body text-[15.5px] text-theme-light">
            {item.text}
          </p>
        </div>
      ))}
    </div>
  );
}

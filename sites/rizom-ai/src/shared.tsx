import type { JSX, ComponentChildren } from "preact";
import { Button, Section, renderHighlightedText } from "@brains/site-rizom";
import { z } from "@brains/utils/zod";

export interface CtaLink {
  label: string;
  href: string;
}

export const ctaLinkSchema: z.ZodType<CtaLink> = z.object({
  label: z.string(),
  href: z.string(),
});

/* Rev-5 emphasis: italic Fraunces in the bright accent. */
export const HIGHLIGHT_CLS = "italic font-[395] text-accent-bright";
/* Room emphasis picks up the room accent instead. */
export const ROOM_HIGHLIGHT_CLS = "italic font-[400] text-accent";

/* The mockup's `.cap` section caption: mono, wide-tracked, a short
   accent tick leading in, optional lowercase trail note. */
export function SectCap({
  lead,
  trail,
  className = "",
}: {
  lead: string;
  trail?: string | undefined;
  className?: string;
}): JSX.Element {
  return (
    <p
      className={`reveal flex flex-wrap items-baseline gap-3.5 font-label text-label-xs uppercase tracking-[0.2em] ${className}`}
    >
      <span
        aria-hidden="true"
        className="h-px w-[26px] self-center bg-accent opacity-80"
      />
      <span className="font-medium text-accent">{lead}</span>
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

export const indexRowSchema: z.ZodType<IndexRowData> = z.object({
  no: z.string(),
  kicker: z.string(),
  title: z.string(),
  text: z.string(),
  href: z.string().optional(),
  meta: z.string().optional(),
  metaSub: z.string().optional(),
});

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
      <span className="block">
        <span className="block font-display text-[26px] font-[470] tracking-[-0.01em] text-theme transition-colors group-hover:text-accent [font-variation-settings:'SOFT'_75,'opsz'_60]">
          {row.title}
        </span>
        <span className="mt-1 block max-w-[56ch] font-body text-[15.5px] text-theme-light">
          {row.text}
        </span>
      </span>
      <span className="text-right font-label text-[12px] text-theme-light">
        {row.meta ?? "→"}
        {row.metaSub && (
          <small className="block text-theme-light opacity-70">
            {row.metaSub}
          </small>
        )}
      </span>
    </>
  );

  const rowClass = `reveal ${delayClass} group grid max-w-[1040px] grid-cols-[44px_1fr] items-baseline gap-6 border-t border-theme-light py-6 no-underline md:grid-cols-[64px_176px_1fr_auto]`;

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
          className={`reveal ${i > 0 ? "reveal-delay-1" : ""} border-b border-theme-light font-label text-[12px] text-theme-light no-underline transition-colors hover:text-accent-bright`}
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

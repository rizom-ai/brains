import type { JSX } from "preact";
import { Section } from "./Section";
import { Wordmark } from "./Wordmark";
import { renderHighlightedText } from "./highlighted-text";
import type { RizomBrandSuffix } from "./types";

const HIGHLIGHT_CLS = "italic text-accent font-normal";

export interface EcosystemCard {
  suffix: RizomBrandSuffix;
  title: string;
  body: string;
  linkLabel: string;
  linkHref: string;
}

export interface EcosystemContent {
  eyebrow: string;
  headline: string;
  cards: EcosystemCard[];
}

const HERE_LABEL = "You are here";

const ROLE_COLOR: Record<RizomBrandSuffix, string> = {
  work: "text-accent",
  foundation: "text-secondary",
  ai: "text-accent-bright",
};

const BORDER_COLOR: Record<RizomBrandSuffix, string> = {
  work: "border-t-accent/60",
  foundation: "border-t-secondary/60",
  ai: "border-t-accent-bright/60",
};

const HOVER_BORDER: Record<RizomBrandSuffix, string> = {
  work: "hover:border-t-accent",
  foundation: "hover:border-t-secondary",
  ai: "hover:border-t-accent-bright",
};

const ROLE_CLS = "font-label text-[10.5px] uppercase tracking-[0.26em] mt-1";
const TAGLINE_CLS = "font-body text-[15px] leading-[1.6] text-theme-muted mt-2";
const LINK_CLS =
  "font-label text-[10.5px] uppercase tracking-[0.22em] text-theme-muted self-start mt-[18px] pb-1 border-b border-white/10 transition-colors hover:text-theme";
const HERE_CLS =
  "font-label text-[10.5px] uppercase tracking-[0.22em] text-accent self-start mt-[18px] pb-1";

const Card = ({ card }: { card: EcosystemCard }): JSX.Element => {
  const isHere = card.linkLabel === HERE_LABEL;
  const isDisabled = card.linkHref.trim().length === 0;
  const inner = (
    <>
      <Wordmark
        brandSuffix={card.suffix}
        className="text-[clamp(28px,3vw,40px)] [font-variation-settings:'opsz'_96]"
      />
      <span className={`${ROLE_CLS} ${ROLE_COLOR[card.suffix]}`}>
        {card.title}
      </span>
      <p className={TAGLINE_CLS}>{card.body}</p>
      {isHere ? (
        <span className={HERE_CLS}>{card.linkLabel}</span>
      ) : (
        <span className={LINK_CLS}>{card.linkLabel}</span>
      )}
    </>
  );
  const baseClass = `flex flex-col gap-[14px] border-t pt-7 ${
    isHere ? BORDER_COLOR[card.suffix] : "border-white/10"
  }`;
  return isHere || isDisabled ? (
    <div className={baseClass}>{inner}</div>
  ) : (
    <a
      href={card.linkHref}
      className={`${baseClass} text-inherit no-underline transition-colors ${HOVER_BORDER[card.suffix]}`}
    >
      {inner}
    </a>
  );
};

export const Ecosystem = ({
  eyebrow,
  headline,
  cards,
}: EcosystemContent): JSX.Element => (
  <Section
    id="ecosystem"
    className="pt-[112px] pb-[144px] border-t border-white/5"
  >
    <div className="mx-auto mb-[88px] max-w-[1180px] text-center">
      <span className="font-label text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
        {eyebrow}
      </span>
      <h2 className="mt-5 font-display text-[clamp(34px,4.4vw,60px)] font-[380] leading-[1.04] tracking-[-0.02em] text-heading [font-variation-settings:'opsz'_96]">
        {renderHighlightedText(headline, HIGHLIGHT_CLS)}
      </h2>
    </div>
    <div className="mx-auto grid max-w-[1180px] grid-cols-3 gap-16 max-[768px]:grid-cols-1 max-[768px]:gap-7">
      {cards.map((card) => (
        <Card key={card.suffix} card={card} />
      ))}
    </div>
  </Section>
);

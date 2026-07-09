/** @jsxImportSource preact */
import type { JSX } from "preact";
import { Section } from "@rizom/site-rizom";
import { ProductIllustration } from "./ProductIllustration";
import type { ProductCardContent, ProductVariant } from "./schema";

const VARIANT_INDEX: Record<ProductVariant, number> = {
  rover: 0,
  relay: 1,
  ranger: 2,
};

interface VariantTone {
  themeVars: string;
}

// `--card-text` is set per variant and switches in light mode where the
// dark-mode color would lack contrast on the paper-toned background.
const VARIANT_TONE: Record<ProductVariant, VariantTone> = {
  rover: {
    themeVars:
      "[--card-bg:var(--color-card-rover-bg)] [--card-border:var(--color-card-rover-border)] [--card-border-hover:var(--color-card-rover-border-hover)] [--card-glow:var(--color-glow-rover)] [--card-text:var(--color-accent)] [--card-bar:var(--color-accent)]",
  },
  relay: {
    themeVars:
      "[--card-bg:var(--color-card-relay-bg)] [--card-border:var(--color-card-relay-border)] [--card-border-hover:var(--color-card-relay-border-hover)] [--card-glow:var(--color-glow-relay)] [--card-text:var(--color-secondary)] [--card-bar:var(--color-secondary)]",
  },
  ranger: {
    themeVars:
      "[--card-bg:var(--color-card-ranger-bg)] [--card-border:var(--color-card-ranger-border)] [--card-border-hover:var(--color-card-ranger-border-hover)] [--card-glow:var(--color-glow-ranger)] [--card-text:var(--color-accent-bright)] [--card-bar:var(--color-accent-bright)] light:[--card-text:var(--palette-amber-dark)] light:[--card-bar:var(--palette-amber-dark)]",
  },
};

const ARTICLE_BASE =
  "group relative grid grid-cols-1 gap-8 overflow-hidden rounded-[20px] border [border-color:var(--card-border)] [background-image:var(--card-bg)] p-7 transition-[border-color,box-shadow] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:[border-color:var(--card-border-hover)] hover:[box-shadow:0_30px_80px_-30px_var(--card-glow)] md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:gap-16 md:p-12";

const ARTICLE_RULE =
  "before:content-[''] before:absolute before:inset-x-0 before:top-0 before:h-[2px] before:opacity-90 before:[background:linear-gradient(90deg,transparent,var(--card-bar)_22%,var(--card-bar)_78%,transparent)]";

const ARTICLE_GRAIN =
  "after:content-[''] after:pointer-events-none after:absolute after:inset-0 after:[background-image:var(--bg-noise)] after:[background-size:240px_240px] after:opacity-[0.06] after:mix-blend-overlay";

const HEADLINE_ACCENT =
  "font-[520] italic tracking-normal [color:var(--card-text)]";

const renderEditorialHeadline = (headline: string): JSX.Element => {
  const explicit = headline.match(/^(.*)\*([^*]+)\*(.*)$/);
  if (explicit) {
    return (
      <>
        {explicit[1]}
        <em className={HEADLINE_ACCENT}>{explicit[2]}</em>
        {explicit[3]}
      </>
    );
  }

  const lastWord = headline.match(/^(.*\s)(\S+)$/);
  if (!lastWord) {
    return <>{headline}</>;
  }

  return (
    <>
      {lastWord[1]}
      <em className={HEADLINE_ACCENT}>{lastWord[2]}</em>
    </>
  );
};

export const ProductCard = ({
  variant,
  label,
  badge,
  headline,
  description,
  tags,
}: ProductCardContent): JSX.Element => {
  const tone = VARIANT_TONE[variant];
  const flip = VARIANT_INDEX[variant] === 1;

  return (
    <Section className="reveal py-9">
      <article
        className={`${ARTICLE_BASE} ${ARTICLE_RULE} ${ARTICLE_GRAIN} ${tone.themeVars}`}
      >
        <div
          className={`relative z-[1] flex min-w-0 flex-col ${
            flip ? "md:order-2" : ""
          }`}
        >
          <header className="flex items-center justify-between gap-4">
            <span className="font-mono text-[14px] font-medium uppercase tracking-[0.16em] [color:var(--card-text)] transition-[letter-spacing] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover:tracking-[0.22em] md:text-[16px]">
              {label}
            </span>
            <span className="inline-flex items-center font-mono text-[11px] font-medium uppercase tracking-[0.16em] [color:var(--card-text)] whitespace-nowrap">
              <span className="mr-2 opacity-65">[</span>
              {badge}
              <span className="ml-2 opacity-65">]</span>
            </span>
          </header>

          <h3 className="mt-3.5 font-display text-[36px] font-[520] leading-[1.08] tracking-[-0.4px] text-theme md:text-[52px] md:tracking-[-1px]">
            {renderEditorialHeadline(headline)}
          </h3>

          <p className="mt-[22px] max-w-[58ch] text-[16px] leading-[1.55] text-theme-muted">
            {description}
          </p>

          <footer className="mt-auto pt-8">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-theme-muted">
              {tags.map((tag, index) => (
                <span key={tag} className="whitespace-nowrap">
                  {tag}
                  {index < tags.length - 1 ? (
                    <span className="ml-3 opacity-50">·</span>
                  ) : null}
                </span>
              ))}
            </div>
          </footer>
        </div>

        <div
          className={`relative z-[1] order-first aspect-[511/320] self-center ${
            flip
              ? "mx-[-28px] w-[calc(100%+56px)] md:order-1 md:ml-[-48px] md:mr-0 md:w-[calc(100%+48px)]"
              : "mx-[-28px] w-[calc(100%+56px)] md:order-none md:ml-0 md:mr-[-48px] md:w-[calc(100%+48px)]"
          }`}
        >
          <ProductIllustration variant={variant} />
        </div>
      </article>
    </Section>
  );
};

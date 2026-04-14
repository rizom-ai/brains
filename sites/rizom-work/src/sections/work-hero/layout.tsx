import type { JSX } from "preact";
import type { WorkHeroContent } from "./schema";
import { Button, Section } from "@brains/site-rizom";

export const WorkHeroLayout = ({
  kicker,
  headlineStart,
  headlineEmphasis,
  headlineEnd,
  subtitle,
  primaryCtaLabel,
  primaryCtaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
  diagnosticTitle,
  diagnosticTag,
  verdictLabel,
  verdictValue,
  findingsLabel,
  findings,
  diagnosticCtaLabel,
  diagnosticCtaHref,
}: WorkHeroContent): JSX.Element => {
  return (
    <Section
      id="hero"
      className="work-hero relative min-h-[100dvh] flex items-center overflow-hidden py-24 md:py-16"
    >
      <div className="work-hero-grid grid w-full items-center gap-10 md:gap-16 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="work-hero-text relative z-[2]">
          <div className="work-kicker inline-flex items-center gap-3 font-label text-label-sm font-semibold uppercase tracking-[0.18em] text-accent mb-6 opacity-0 animate-hero-rise [animation-delay:0.1s]">
            <span>{kicker}</span>
          </div>
          <h1 className="work-hero-title font-display font-medium text-[38px] tracking-[-1.8px] leading-[1.02] md:text-display-xl mb-7 opacity-0 animate-hero-rise [animation-delay:0.2s] max-w-[14ch]">
            {headlineStart}{" "}
            <span className="italic text-accent">{headlineEmphasis}</span>
            {headlineEnd}
          </h1>
          <p className="work-hero-subtitle font-body text-body-md md:text-body-lg text-theme-muted max-w-[560px] mb-9 opacity-0 animate-hero-rise [animation-delay:0.4s]">
            {subtitle}
          </p>
          <div className="work-hero-cta flex flex-col md:flex-row gap-3 md:gap-4 md:flex-wrap opacity-0 animate-hero-rise [animation-delay:0.6s]">
            <Button href={primaryCtaHref} variant="primary" block>
              {primaryCtaLabel}
            </Button>
            <Button href={secondaryCtaHref} variant="secondary" block>
              {secondaryCtaLabel}
            </Button>
          </div>
        </div>

        <div className="work-diagnostic relative z-[2] w-full max-w-[540px] ml-auto rounded-2xl border border-accent/30 bg-[linear-gradient(180deg,rgba(22,16,40,0.97)_0%,rgba(14,10,26,0.97)_100%)] p-7 md:p-8 shadow-[0_32px_80px_-24px_rgba(0,0,0,0.7)] opacity-0 animate-hero-rise [animation-delay:0.75s]">
          <div className="work-diagnostic-bar absolute inset-x-0 top-0 h-[2px] rounded-t-2xl bg-[linear-gradient(90deg,transparent,var(--color-accent)_25%,var(--palette-amber-light)_50%,var(--color-accent)_75%,transparent)]" />
          <div className="flex items-baseline justify-between gap-4 border-b border-white/12 pb-4 mb-4">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.25em] text-[var(--palette-amber-light)]">
              {diagnosticTitle}
            </span>
            <span className="font-mono text-[9.5px] uppercase tracking-[0.15em] text-theme-light">
              {diagnosticTag}
            </span>
          </div>

          <div className="py-2">
            <svg
              viewBox="0 0 360 310"
              className="w-full h-auto block"
              role="img"
              aria-label="Six-axis radar chart showing team coordination scores"
            >
              <g opacity="0.95">
                <polygon
                  className="fill-none stroke-white/13 [stroke-width:1.2]"
                  points="180,130 197.32,140 197.32,160 180,170 162.68,160 162.68,140"
                />
                <polygon
                  className="fill-none stroke-white/13 [stroke-width:1.2]"
                  points="180,110 214.64,130 214.64,170 180,190 145.36,170 145.36,130"
                />
                <polygon
                  className="fill-none stroke-white/13 [stroke-width:1.2]"
                  points="180,90 231.96,120 231.96,180 180,210 128.04,180 128.04,120"
                />
                <polygon
                  className="fill-none stroke-white/13 [stroke-width:1.2]"
                  points="180,70 249.28,110 249.28,190 180,230 110.72,190 110.72,110"
                />
                <polygon
                  className="fill-none stroke-white/26 [stroke-width:1.5]"
                  points="180,50 266.60,100 266.60,200 180,250 93.40,200 93.40,100"
                />
                <line
                  className="stroke-white/11 [stroke-width:1.2] [stroke-dasharray:2_4]"
                  x1="180"
                  y1="150"
                  x2="180"
                  y2="50"
                />
                <line
                  className="stroke-white/11 [stroke-width:1.2] [stroke-dasharray:2_4]"
                  x1="180"
                  y1="150"
                  x2="266.60"
                  y2="100"
                />
                <line
                  className="stroke-white/11 [stroke-width:1.2] [stroke-dasharray:2_4]"
                  x1="180"
                  y1="150"
                  x2="266.60"
                  y2="200"
                />
                <line
                  className="stroke-white/11 [stroke-width:1.2] [stroke-dasharray:2_4]"
                  x1="180"
                  y1="150"
                  x2="180"
                  y2="250"
                />
                <line
                  className="stroke-white/11 [stroke-width:1.2] [stroke-dasharray:2_4]"
                  x1="180"
                  y1="150"
                  x2="93.40"
                  y2="200"
                />
                <line
                  className="stroke-white/11 [stroke-width:1.2] [stroke-dasharray:2_4]"
                  x1="180"
                  y1="150"
                  x2="93.40"
                  y2="100"
                />
              </g>
              <g>
                <polygon
                  className="fill-accent/20 stroke-accent [stroke-width:2.5] [stroke-linejoin:round]"
                  points="180,95 233.69,119 209.44,167 180,171 154.89,164.5 143.63,129"
                />
                <circle
                  className="fill-white stroke-[var(--color-bg)] [stroke-width:2]"
                  cx="180"
                  cy="95"
                  r="4"
                />
                <circle
                  className="fill-white stroke-[var(--color-bg)] [stroke-width:2]"
                  cx="233.69"
                  cy="119"
                  r="4"
                />
                <circle
                  className="fill-white stroke-[var(--color-bg)] [stroke-width:2]"
                  cx="209.44"
                  cy="167"
                  r="4"
                />
                <circle
                  className="fill-white stroke-[var(--color-bg)] [stroke-width:2]"
                  cx="180"
                  cy="171"
                  r="4"
                />
                <circle
                  className="fill-white stroke-[var(--color-bg)] [stroke-width:2]"
                  cx="154.89"
                  cy="164.5"
                  r="4"
                />
                <circle
                  className="fill-white stroke-[var(--color-bg)] [stroke-width:2]"
                  cx="143.63"
                  cy="129"
                  r="4"
                />
              </g>
              <g className="font-mono text-[10.5px] font-semibold uppercase tracking-[1.4px] fill-white/82">
                <text x="180" y="34" text-anchor="middle">
                  Specialization
                </text>
                <text x="278" y="94" text-anchor="start">
                  Credibility
                </text>
                <text x="278" y="214" text-anchor="start">
                  Coordination
                </text>
                <text x="180" y="282" text-anchor="middle">
                  Info flow
                </text>
                <text x="82" y="214" text-anchor="end">
                  Authority
                </text>
                <text x="82" y="94" text-anchor="end">
                  AI ready
                </text>
              </g>
            </svg>
          </div>

          <div className="flex items-baseline justify-between gap-4 border-t border-white/12 pt-5 pb-4 mt-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-theme-light">
              {verdictLabel}
            </span>
            <span className="font-display italic text-[18px] text-theme text-right">
              {verdictValue}
            </span>
          </div>

          <div className="border-t border-white/12 pt-5">
            <span className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-theme-light">
              {findingsLabel}
            </span>
            <ul className="mt-4 flex flex-col gap-3">
              {findings.map((finding, index) => (
                <li
                  key={finding}
                  className="flex items-baseline gap-3 text-body-xs text-white/84"
                >
                  <span className="font-mono text-[10px] text-white/42 min-w-[18px]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{finding}</span>
                </li>
              ))}
            </ul>
          </div>

          <a
            href={diagnosticCtaHref}
            className="work-diagnostic-cta mt-5 inline-flex w-full items-center justify-center rounded-[10px] border border-white/18 px-4 py-3 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/88 hover:bg-white/5 hover:border-white/36"
          >
            {diagnosticCtaLabel}
          </a>
        </div>
      </div>

      <a className="scroll-cue" href="#problem" aria-label="Scroll to content">
        <span>Scroll</span>
        <span className="scroll-cue-line"></span>
      </a>
    </Section>
  );
};

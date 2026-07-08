/** @jsxImportSource preact */
import type { JSX } from "preact";
import type { WorkHeroContent } from "./schema";
import { Section, renderHighlightedText } from "@rizom/site-rizom";
import { WorkButton, newTabProps } from "../../link-targets";

const HIGHLIGHT_CLS = "italic text-accent";
const RADAR_OUTER_RING_CLASS = "fill-none stroke-white/26 [stroke-width:1.5]";
const RADAR_SHAPE_CLASS =
  "fill-accent/20 stroke-accent [stroke-width:2.5] [stroke-linejoin:round]";
const RADAR_NODE_CLASS = "fill-white stroke-[var(--color-bg)] [stroke-width:2]";
const RADAR_LABEL_CLASS =
  "font-mono text-[10px] font-semibold uppercase tracking-[1.6px] fill-white/64";

const RADAR_OUTER_POINTS = "180,50 266.60,200 93.40,200";
const RADAR_DATA_POINTS = "180,95 233.69,181 150.56,167";

const RADAR_NODES = [
  { cx: "180", cy: "95" },
  { cx: "233.69", cy: "181" },
  { cx: "150.56", cy: "167" },
] as const;

const RADAR_LABELS = [
  { x: "180", y: "34", textAnchor: "middle", name: "Specialization" },
  { x: "252", y: "222", textAnchor: "start", name: "Credibility" },
  { x: "108", y: "222", textAnchor: "end", name: "Coordination" },
] as const;

export const WorkHeroLayout = ({
  kicker,
  headline,
  subtitle,
  primaryCtaLabel,
  primaryCtaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
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
      className="relative overflow-hidden lg:flex lg:min-h-[100dvh] lg:items-center lg:pt-[120px] lg:pb-16"
    >
      <div className="grid w-full gap-7 lg:grid-cols-[0.95fr_1.05fr] lg:grid-rows-[auto_auto] lg:items-center lg:gap-x-16 lg:gap-y-0">
        <div className="flex min-h-[100dvh] flex-col pt-[104px] pb-10 lg:contents">
          <div className="flex flex-1 flex-col justify-center gap-7 lg:contents">
            <div className="relative z-[2] lg:col-start-1 lg:row-start-1">
              <div className="mb-5 inline-flex items-center gap-[14px] font-label text-[11px] font-semibold uppercase text-accent opacity-0 animate-hero-rise [animation-delay:0.1s] [letter-spacing:2.8px] before:block before:h-px before:w-8 before:bg-accent before:opacity-80 before:content-[''] max-[768px]:gap-3 max-[768px]:text-[10px] max-[768px]:tracking-[2.4px] max-[768px]:before:w-6 md:mb-6">
                <span>{kicker}</span>
              </div>
              <h1 className="mb-6 max-w-full font-display text-[34px] font-[520] leading-[1.04] tracking-[-0.9px] text-theme opacity-0 animate-hero-rise [animation-delay:0.2s] min-[420px]:text-[36px] md:mb-7 md:text-[clamp(36px,5.2vw,76px)] md:leading-none md:tracking-[-2px] lg:max-w-[14ch]">
                {renderHighlightedText(headline, HIGHLIGHT_CLS)}
              </h1>
              <p className="max-w-[500px] font-body text-[15.5px] leading-[1.68] text-theme-muted opacity-0 animate-hero-rise [animation-delay:0.4s] md:mb-10 md:text-[18px] md:leading-[1.65]">
                {subtitle}
              </p>
            </div>

            <div className="flex flex-col gap-3 opacity-0 animate-hero-rise [animation-delay:0.6s] md:flex-row md:flex-wrap md:gap-[14px] max-[768px]:[&_.rizom-btn]:w-full max-[768px]:[&_.rizom-btn]:justify-center max-[768px]:[&_.rizom-btn]:px-6 max-[768px]:[&_.rizom-btn]:py-[15px] lg:col-start-1 lg:row-start-2">
              <WorkButton href={primaryCtaHref} variant="primary" block>
                {primaryCtaLabel}
              </WorkButton>
              <WorkButton href={secondaryCtaHref} variant="secondary" block>
                {secondaryCtaLabel}
              </WorkButton>
            </div>
          </div>
        </div>

        <div
          id="hero-diagnostic"
          className="rizom-diagnostic-panel relative z-[2] w-full max-w-[500px] rounded-[14px] border border-accent/30 px-[18px] py-5 opacity-0 animate-hero-rise [animation-delay:0.75s] md:rounded-2xl md:px-[30px] md:pt-5 md:pb-[26px] max-[1100px]:mx-auto max-[1100px]:max-w-[480px] max-[768px]:mb-14 max-[380px]:px-4 lg:ml-auto lg:col-start-2 lg:row-start-1 lg:row-span-2"
        >
          <div className="rizom-diagnostic-panel-bar absolute inset-x-0 top-0 h-[2px] rounded-t-2xl" />

          <div className="relative pb-2 md:pb-3">
            <svg
              viewBox="0 4 360 248"
              className="block h-auto w-full"
              role="img"
              aria-label="Three-axis TMS radar — Specialization, Credibility, Coordination"
            >
              <polygon
                className={RADAR_OUTER_RING_CLASS}
                points={RADAR_OUTER_POINTS}
              />
              <polygon
                className={RADAR_SHAPE_CLASS}
                points={RADAR_DATA_POINTS}
              />
              {RADAR_NODES.map(({ cx, cy }) => (
                <circle
                  key={`${cx}-${cy}`}
                  className={RADAR_NODE_CLASS}
                  cx={cx}
                  cy={cy}
                  r="4"
                />
              ))}
              {RADAR_LABELS.map(({ x, y, textAnchor, name }) => (
                <text
                  key={name}
                  className={RADAR_LABEL_CLASS}
                  x={x}
                  y={y}
                  textAnchor={textAnchor}
                >
                  {name}
                </text>
              ))}
            </svg>
          </div>

          <div className="flex items-baseline justify-between gap-4 border-t border-white/12 py-[18px] max-[420px]:flex-col max-[420px]:items-start max-[420px]:gap-1.5 max-[420px]:py-4">
            <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.18em] text-theme-light">
              {verdictLabel}
            </span>
            <span className="whitespace-nowrap text-right font-display italic text-[22px] font-medium leading-[1.05] tracking-[-0.015em] text-theme [font-variation-settings:'opsz'_96] max-[420px]:text-left max-[420px]:text-[20px] max-[360px]:text-[18px]">
              {verdictValue}
            </span>
          </div>

          <div className="border-t border-white/12 pt-2.5 md:pt-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-[8px] uppercase tracking-[0.22em] text-theme-light md:text-[9.5px] md:tracking-[0.2em]">
                {findingsLabel}
              </span>
              <span className="flex items-baseline gap-1.5 font-mono text-[8px] uppercase tracking-[0.18em] text-theme-light md:text-[9.5px]">
                <span aria-hidden className="text-theme-light/60">
                  →
                </span>
                <span className="text-accent/85">Coordination</span>
                <span className="tabular-nums text-accent/85">
                  34<span className="opacity-60">/100</span>
                </span>
              </span>
            </div>
            <ul className="mt-3 flex flex-col gap-2 md:mt-4 md:gap-3">
              {findings.map((finding, index) => (
                <li
                  key={finding}
                  className="flex items-baseline gap-3 text-[11.5px] leading-[1.38] text-white/84 md:text-body-xs md:leading-[1.5]"
                >
                  <span className="min-w-[26px] font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-accent/80 md:text-[10px]">
                    {`[${String(index + 1).padStart(2, "0")}]`}
                  </span>
                  <span>{finding}</span>
                </li>
              ))}
            </ul>
          </div>

          <a
            href={diagnosticCtaHref}
            {...newTabProps(diagnosticCtaHref)}
            className="mt-3 inline-flex w-full items-center justify-center rounded-[10px] border border-white/18 px-3 py-2.5 font-mono text-[8.5px] uppercase tracking-[0.18em] text-white/88 transition-colors hover:border-accent/60 hover:bg-accent/8 hover:text-theme md:mt-5 md:px-4 md:py-3 md:text-[10.5px]"
          >
            {diagnosticCtaLabel}
          </a>
        </div>
      </div>
    </Section>
  );
};

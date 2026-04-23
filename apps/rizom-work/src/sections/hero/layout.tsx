import type { JSX } from "preact";
import type { WorkHeroContent } from "./schema";
import { Button, Section, renderHighlightedText } from "@rizom/ui";

/** rizom.work's highlight voice: italic + accent color. */
const HIGHLIGHT_CLS = "italic text-accent";
const RADAR_RING_CLASS = "fill-none stroke-white/13 [stroke-width:1.2]";
const RADAR_OUTER_RING_CLASS = "fill-none stroke-white/26 [stroke-width:1.5]";
const RADAR_AXIS_CLASS =
  "stroke-white/11 [stroke-width:1.2] [stroke-dasharray:2_4]";
const RADAR_SHAPE_CLASS =
  "fill-accent/20 stroke-accent [stroke-width:2.5] [stroke-linejoin:round]";
const RADAR_NODE_CLASS = "fill-white stroke-[var(--color-bg)] [stroke-width:2]";
const RADAR_LABEL_CLASS =
  "font-mono text-[10.5px] font-semibold uppercase tracking-[1.4px] fill-white/82";

const RADAR_RINGS = [
  "180,130 197.32,140 197.32,160 180,170 162.68,160 162.68,140",
  "180,110 214.64,130 214.64,170 180,190 145.36,170 145.36,130",
  "180,90 231.96,120 231.96,180 180,210 128.04,180 128.04,120",
  "180,70 249.28,110 249.28,190 180,230 110.72,190 110.72,110",
] as const;

const RADAR_AXES = [
  { x2: "180", y2: "50" },
  { x2: "266.60", y2: "100" },
  { x2: "266.60", y2: "200" },
  { x2: "180", y2: "250" },
  { x2: "93.40", y2: "200" },
  { x2: "93.40", y2: "100" },
] as const;

const RADAR_NODES = [
  { cx: "180", cy: "95" },
  { cx: "233.69", cy: "119" },
  { cx: "209.44", cy: "167" },
  { cx: "180", cy: "171" },
  { cx: "154.89", cy: "164.5" },
  { cx: "143.63", cy: "129" },
] as const;

const RADAR_LABELS = [
  { x: "180", y: "34", textAnchor: "middle", label: "Specialization" },
  { x: "278", y: "94", textAnchor: "start", label: "Credibility" },
  { x: "278", y: "214", textAnchor: "start", label: "Coordination" },
  { x: "180", y: "282", textAnchor: "middle", label: "Info flow" },
  { x: "82", y: "214", textAnchor: "end", label: "Authority" },
  { x: "82", y: "94", textAnchor: "end", label: "AI ready" },
] as const;

export const WorkHeroLayout = ({
  kicker,
  headline,
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
      className="relative flex min-h-[100dvh] items-center overflow-hidden pt-[120px] pb-16 max-[900px]:pt-24 max-[900px]:pb-12"
    >
      <div className="grid w-full items-center gap-16 lg:grid-cols-[0.95fr_1.05fr] max-[1100px]:grid-cols-1 max-[1100px]:gap-12 max-[1100px]:pt-10">
        <div className="relative z-[2]">
          <div className="mb-6 inline-flex items-center gap-[14px] font-label text-label-sm font-semibold uppercase text-accent opacity-0 animate-hero-rise [animation-delay:0.1s] [letter-spacing:2.8px]">
            <span
              aria-hidden
              className="inline-block h-px w-8 bg-accent opacity-80"
            />
            <span>{kicker}</span>
          </div>
          <h1 className="mb-7 max-w-[14ch] font-display text-[clamp(36px,5.2vw,76px)] font-[520] leading-none tracking-[-2px] opacity-0 animate-hero-rise [animation-delay:0.2s] max-[1100px]:max-w-full">
            {renderHighlightedText(headline, HIGHLIGHT_CLS)}
          </h1>
          <p className="mb-10 max-w-[500px] font-body text-[18px] leading-[1.65] text-theme-muted opacity-0 animate-hero-rise [animation-delay:0.4s]">
            {subtitle}
          </p>
          <div className="flex flex-col gap-[14px] opacity-0 animate-hero-rise [animation-delay:0.6s] md:flex-row md:flex-wrap">
            <Button href={primaryCtaHref} variant="primary" block>
              {primaryCtaLabel}
            </Button>
            <Button href={secondaryCtaHref} variant="secondary" block>
              {secondaryCtaLabel}
            </Button>
          </div>
        </div>

        <div className="rizom-diagnostic-panel relative z-[2] ml-auto w-full max-w-[540px] rounded-2xl border border-accent/30 p-8 opacity-0 animate-hero-rise [animation-delay:0.75s] max-[1100px]:mx-auto max-[1100px]:max-w-[520px] max-[900px]:p-6">
          <div className="rizom-diagnostic-panel-bar absolute inset-x-0 top-0 h-[2px] rounded-t-2xl" />
          <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-white/12 pb-4">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.25em] text-[var(--color-work-diagnostic-label)]">
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
                {RADAR_RINGS.map((points) => (
                  <polygon
                    key={points}
                    className={RADAR_RING_CLASS}
                    points={points}
                  />
                ))}
                <polygon
                  className={RADAR_OUTER_RING_CLASS}
                  points="180,50 266.60,100 266.60,200 180,250 93.40,200 93.40,100"
                />
                {RADAR_AXES.map(({ x2, y2 }) => (
                  <line
                    key={`${x2}-${y2}`}
                    className={RADAR_AXIS_CLASS}
                    x1="180"
                    y1="150"
                    x2={x2}
                    y2={y2}
                  />
                ))}
              </g>
              <g>
                <polygon
                  className={RADAR_SHAPE_CLASS}
                  points="180,95 233.69,119 209.44,167 180,171 154.89,164.5 143.63,129"
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
              </g>
              <g className={RADAR_LABEL_CLASS}>
                {RADAR_LABELS.map(({ x, y, textAnchor, label }) => (
                  <text key={label} x={x} y={y} textAnchor={textAnchor}>
                    {label}
                  </text>
                ))}
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
            className="mt-5 inline-flex w-full items-center justify-center rounded-[10px] border border-white/18 px-4 py-3 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/88 hover:border-white/36 hover:bg-white/5"
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

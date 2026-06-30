import type { JSX } from "preact";
import { Section } from "@rizom/ui";
import { WORK_KICKER, WORK_RULE } from "../styles";
import type { ProofContent, ProofTestimonial } from "./schema";

const ROTATOR_STEP_SECONDS = 6;

const rotatorAnimationVars = (
  index: number,
  total: number,
): JSX.CSSProperties =>
  ({
    "--rotator-duration": `${Math.max(total, 1) * ROTATOR_STEP_SECONDS}s`,
    "--rotator-delay": `${index * ROTATOR_STEP_SECONDS}s`,
  }) as JSX.CSSProperties;

const QuoteMark = ({ large = false }: { large?: boolean }): JSX.Element => (
  <span
    aria-hidden="true"
    className={
      large
        ? "pointer-events-none absolute -left-2 -top-10 font-display font-[300] italic text-[140px] leading-none text-accent/25 max-[768px]:-left-1 max-[768px]:-top-6 max-[768px]:text-[96px]"
        : "pointer-events-none absolute -left-1.5 -top-9 font-display font-[300] italic text-[120px] leading-none text-accent/25 max-[768px]:-left-1 max-[768px]:-top-5 max-[768px]:text-[88px]"
    }
  >
    “
  </span>
);

export const ProofLayout = ({
  kicker,
  headline,
  testimonials,
  quote,
  attribution,
}: ProofContent): JSX.Element => {
  const items: ProofTestimonial[] =
    testimonials && testimonials.length > 0
      ? testimonials
      : quote
        ? [{ quote, attribution: attribution ?? "" }]
        : [];

  return (
    <Section
      id="proof"
      className="reveal py-[128px] text-center max-[768px]:py-20"
    >
      <div
        className={`${WORK_RULE} mb-16 -mt-16 max-[768px]:-mt-10 max-[768px]:mb-12`}
      />

      <div className="mx-auto mb-16 max-w-[720px] text-center max-[768px]:mb-12">
        <span className={`${WORK_KICKER} mb-3`}>{kicker}</span>
        <h2 className="mt-3 font-display text-[clamp(32px,4.5vw,56px)] font-[520] leading-[1.05] tracking-[-1.4px] text-theme max-[768px]:text-[30px] max-[768px]:tracking-[-0.9px]">
          {headline}
        </h2>
      </div>

      {items.length > 1 ? (
        <div className="reveal reveal-delay-1 mx-auto max-w-[920px]">
          <div className="relative mx-auto px-10 py-8 text-left max-[768px]:px-4 max-[768px]:py-4">
            <div className="relative min-h-[340px] max-[768px]:min-h-[500px] motion-reduce:min-h-0 motion-reduce:space-y-12">
              {items.map((item, index) => (
                <blockquote
                  key={item.quote}
                  style={rotatorAnimationVars(index, items.length)}
                  className="absolute inset-0 pr-10 opacity-0 blur-[6px] translate-y-4 animate-[rizom-work-rotator-reveal_var(--rotator-duration)_cubic-bezier(0.2,0.8,0.2,1)_infinite] [animation-delay:var(--rotator-delay)] motion-reduce:relative motion-reduce:inset-auto motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:blur-0 motion-reduce:animate-none max-[768px]:pr-0"
                >
                  <div className="relative">
                    <QuoteMark large />
                    <p className="relative mb-8 pl-16 font-display italic font-[380] text-[clamp(24px,3vw,38px)] leading-[1.28] tracking-[-0.7px] text-theme [font-variation-settings:'opsz'_96] max-[768px]:mb-7 max-[768px]:pl-9 max-[768px]:text-[22px] max-[768px]:leading-[1.32]">
                      {item.quote}
                    </p>
                  </div>
                  <footer className="pl-16 font-label text-[11px] font-medium uppercase tracking-[2px] text-theme-light max-[768px]:pl-9">
                    — {item.attribution}
                  </footer>
                </blockquote>
              ))}
            </div>

            <div
              className="relative mt-8 flex justify-center gap-3 motion-reduce:hidden"
              aria-hidden="true"
            >
              {items.map((item, index) => (
                <span
                  key={item.attribution + index}
                  className="relative h-1.5 w-10 overflow-hidden rounded-full bg-theme-light/25"
                >
                  <span
                    style={rotatorAnimationVars(index, items.length)}
                    className="absolute inset-0 -translate-x-full rounded-full bg-accent animate-[rizom-work-rotator-progress_var(--rotator-duration)_linear_infinite] [animation-delay:var(--rotator-delay)]"
                  />
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto grid max-w-[980px] gap-12 max-[768px]:gap-10">
          {items.map((item, index) => (
            <blockquote
              key={item.quote}
              className={`reveal reveal-delay-${Math.min(index + 1, 3)} relative mx-auto max-w-[760px] px-10 text-left max-[768px]:px-4`}
            >
              <div className="relative">
                <QuoteMark />
                <p className="relative mb-7 pl-14 font-display italic font-[380] text-[clamp(22px,2.7vw,34px)] leading-[1.3] tracking-[-0.6px] text-theme [font-variation-settings:'opsz'_96] max-[768px]:pl-8 max-[768px]:text-[21px]">
                  {item.quote}
                </p>
              </div>
              <footer className="pl-14 font-label text-[11px] font-medium uppercase tracking-[2px] text-theme-light max-[768px]:pl-8">
                — {item.attribution}
              </footer>
            </blockquote>
          ))}
        </div>
      )}
    </Section>
  );
};

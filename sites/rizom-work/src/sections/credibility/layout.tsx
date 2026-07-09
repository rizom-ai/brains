/** @jsxImportSource preact */
import type { JSX } from "preact";
import { Section } from "@rizom/site-rizom";
import { WORK_KICKER, WORK_RULE } from "../styles";
import type { CredibilityContent } from "./schema";

export const CredibilityLayout = ({
  kicker,
  headline,
  cards,
}: CredibilityContent): JSX.Element => {
  return (
    <Section id="methodology" className="reveal py-[128px] max-[768px]:py-20">
      <div
        className={`${WORK_RULE} mb-16 -mt-16 max-[768px]:-mt-10 max-[768px]:mb-12`}
      />

      <div className="mx-auto mb-20 max-w-[760px] text-center max-[768px]:mb-14">
        <span className={`${WORK_KICKER} mb-3`}>{kicker}</span>
        <h2 className="mt-3 font-display text-[clamp(34px,4.8vw,60px)] font-[520] leading-[1.04] tracking-[-1.5px] text-theme max-[768px]:text-[31px] max-[768px]:tracking-[-1px]">
          {headline}
        </h2>
      </div>

      <div className="mx-auto grid max-w-[1120px] grid-cols-2 gap-6 max-[768px]:grid-cols-1 max-[768px]:gap-4">
        {cards.map((card, index) => (
          <article
            key={card.title}
            className={`reveal reveal-delay-${Math.min(index + 1, 3)} rounded-2xl border border-[var(--color-work-divider-soft)] bg-white/[0.025] p-7 max-[768px]:rounded-xl max-[768px]:p-5`}
          >
            <div className="mb-4 font-label text-[11px] font-semibold uppercase tracking-[2.5px] text-accent">
              {String(index + 1).padStart(2, "0")}
            </div>
            <h3 className="mb-3 font-display text-[24px] font-[520] leading-[1.15] tracking-[-0.5px] text-theme max-[768px]:text-[20px]">
              {card.title}
            </h3>
            <p className="font-body text-[16px] leading-[1.72] text-theme-muted max-[768px]:text-[14.5px] max-[768px]:leading-[1.68]">
              {card.body}
            </p>
          </article>
        ))}
      </div>
    </Section>
  );
};

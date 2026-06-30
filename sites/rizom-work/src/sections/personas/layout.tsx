import type { JSX } from "preact";
import { Section } from "@rizom/ui";
import { WORK_KICKER, WORK_RULE } from "../styles";
import type { PersonasContent } from "./schema";

export const PersonasLayout = ({
  kicker,
  headline,
  cards,
}: PersonasContent): JSX.Element => {
  return (
    <Section id="personas" className="reveal py-[128px] max-[768px]:py-20">
      <div
        className={`${WORK_RULE} mb-16 -mt-16 max-[768px]:-mt-10 max-[768px]:mb-12`}
      />

      <div className="mx-auto mb-[88px] max-w-[720px] text-center max-[768px]:mb-14">
        <span className={`${WORK_KICKER} mb-3`}>{kicker}</span>
        <h2 className="mt-3 font-display text-[clamp(36px,5vw,64px)] font-[520] leading-[1.02] tracking-[-1.5px] text-theme max-[768px]:text-[32px] max-[768px]:tracking-[-1px]">
          {headline}
        </h2>
      </div>

      <div className="mx-auto grid max-w-[1160px] grid-cols-2 gap-[72px] max-[1100px]:gap-12 max-[768px]:grid-cols-1 max-[768px]:gap-10">
        {cards.map((card, i) => (
          <div
            key={card.label}
            className={`reveal reveal-delay-${i + 1} flex flex-col gap-[22px] border-t border-[var(--color-work-divider-strong)] pt-14 max-[768px]:pt-10`}
          >
            <span className="font-label text-[11px] font-semibold uppercase tracking-[2.5px] text-secondary">
              {card.label}
            </span>
            <p className="max-w-[500px] font-display text-[clamp(24px,2.6vw,32px)] italic leading-[1.2] tracking-[-0.6px] text-theme max-[768px]:text-[22px]">
              {card.quote}
            </p>
            <p className="max-w-[500px] font-body text-[17px] leading-[1.75] text-theme-muted max-[768px]:text-[15px] max-[768px]:leading-[1.68]">
              {card.body}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
};

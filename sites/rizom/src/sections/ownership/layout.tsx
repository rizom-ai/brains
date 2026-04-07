import type { JSX } from "preact";
import type { OwnershipContent } from "./schema";
import { Section } from "../../components/Section";
import { Badge } from "../../components/Badge";

export const OwnershipLayout = ({
  badge,
  headline,
  features,
}: OwnershipContent): JSX.Element => {
  return (
    <Section id="ownership" className="reveal py-section">
      <div className="flex flex-col md:flex-row gap-9 md:gap-20 items-start">
        <div className="w-full md:w-[45%]">
          <Badge>{badge}</Badge>
          <h2 className="font-display text-[28px] tracking-[-1px] leading-[1.1] md:text-display-md mt-4 md:mt-6">
            {headline}
          </h2>
        </div>
        <div className="w-full md:w-[55%] flex flex-col gap-8 md:pt-[60px]">
          {features.map((row, i) => (
            <div
              key={row.icon + row.title}
              className={`reveal reveal-delay-${i + 1} flex gap-4 md:gap-5 items-start`}
            >
              <div className="shrink-0 min-w-[44px] md:min-w-[48px] h-11 md:h-12 flex items-center justify-center border border-accent rounded-lg font-nav text-[18px] md:text-heading-md font-bold text-accent">
                {row.icon}
              </div>
              <div>
                <div className="font-nav text-heading-sm md:text-heading-md font-bold mb-1.5">
                  {row.title}
                </div>
                <p className="text-body-xs md:text-body-sm text-theme-muted">
                  {row.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
};

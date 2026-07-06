/** @jsxImportSource preact */
import type { JSX } from "preact";
import { Section } from "@brains/site-rizom";
import { WORK_KICKER, WORK_RULE } from "../styles";
import type { OwnershipContent } from "./schema";

const renderBody = (body: string): JSX.Element => {
  const marker = "rizom.foundation";
  const index = body.indexOf(marker);

  if (index === -1) return <>{body}</>;

  return (
    <>
      {body.slice(0, index)}
      <a
        href="https://rizom.foundation"
        className="border-b border-transparent text-accent transition-colors hover:border-accent"
      >
        {marker}
      </a>
      {body.slice(index + marker.length)}
    </>
  );
};

export const OwnershipLayout = ({
  kicker,
  headline,
  cards,
}: OwnershipContent): JSX.Element => {
  return (
    <Section id="about" className="reveal py-[128px] max-[768px]:py-20">
      <div
        className={`${WORK_RULE} mb-16 -mt-16 max-[768px]:-mt-10 max-[768px]:mb-12`}
      />

      <div className="mx-auto flex max-w-[1160px] items-start gap-[88px] max-[1100px]:gap-12 max-[768px]:flex-col max-[768px]:gap-10">
        <div className="w-[42%] max-[768px]:w-full">
          <span className={`${WORK_KICKER} mb-4`}>{kicker}</span>
          <h2 className="mt-4 font-display text-[clamp(32px,4.2vw,52px)] font-[520] leading-[1.05] tracking-[-1.4px] text-theme max-[768px]:mt-3 max-[768px]:text-[30px]">
            {headline}
          </h2>
        </div>
        <div className="flex w-[58%] flex-col gap-10 pt-16 max-[768px]:w-full max-[768px]:gap-8 max-[768px]:pt-0">
          {cards.map((card, index) => {
            const badge =
              card.badge.trim() ||
              (card.title.startsWith("A network") ? "+" : "");
            const body = card.body.trim();
            return (
              <div
                key={card.title}
                className={`reveal reveal-delay-${index + 1} flex items-start gap-[22px] max-[768px]:gap-[18px]`}
              >
                <div className="flex h-12 min-w-12 items-center justify-center rounded-lg border border-accent px-3 font-display text-[16px] font-semibold tracking-[-0.3px] text-accent max-[768px]:h-11 max-[768px]:min-w-11 max-[768px]:text-[15px]">
                  {badge}
                </div>
                <div>
                  <div className="mb-1.5 font-display text-[20px] font-[520] text-theme max-[768px]:text-[18px]">
                    {card.title}
                  </div>
                  {body ? (
                    <p className="font-body text-[15px] leading-[1.72] text-theme-muted max-[768px]:text-[14px] max-[768px]:leading-[1.68]">
                      {renderBody(body)}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
};

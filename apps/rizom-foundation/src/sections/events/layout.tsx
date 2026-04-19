import type { JSX } from "preact";
import type { EventsContent } from "./schema";
import { Button, Section } from "@brains/site-rizom";

export const EventsLayout = ({
  kicker,
  headline,
  subhead,
  events,
  primaryCtaLabel,
  primaryCtaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
}: EventsContent): JSX.Element => {
  return (
    <Section id="events" className="reveal py-section">
      <div className="mx-auto max-w-[960px]">
        <div className="mb-10 md:mb-12">
          <div className="flex items-center gap-3 text-accent mb-4">
            <span className="block w-8 h-px bg-accent/80" />
            <span className="font-label text-label-md font-semibold tracking-[0.16em] uppercase">
              {kicker}
            </span>
          </div>
          <h2 className="font-display text-[32px] tracking-[-1px] leading-[1.08] md:text-display-md text-theme max-w-[14ch]">
            {headline}
          </h2>
          <p className="mt-4 text-body-sm md:text-body-md text-theme-muted max-w-[700px]">
            {subhead}
          </p>
        </div>

        <div className="flex flex-col">
          {events.map((event, i) => (
            <a
              key={event.num + event.city}
              href={event.href}
              className={`reveal reveal-delay-${Math.min(i + 1, 3)} group grid grid-cols-[80px_1fr] items-start gap-6 border-t border-[var(--color-foundation-divider-soft)] py-8 transition-all hover:border-accent/40 hover:pl-3 md:grid-cols-[110px_1fr_220px] md:gap-8 md:py-11 md:hover:pl-4 max-[900px]:grid-cols-[80px_1fr] max-[900px]:gap-6 max-[900px]:py-8`}
            >
              <div className="font-display text-[38px] md:text-[54px] leading-none tracking-[-1.5px] text-transparent [-webkit-text-stroke:1.2px_var(--color-accent)]">
                {event.num}
              </div>
              <div>
                <h3 className="font-display text-[28px] md:text-[42px] tracking-[-1.4px] leading-none text-theme transition-colors group-hover:text-accent">
                  {event.city}
                </h3>
                <p className="mt-3 text-body-xs md:text-body-sm text-theme-muted max-w-[560px] italic">
                  {event.description}
                </p>
              </div>
              <div className="flex flex-col gap-2 pt-1 text-body-xs md:pt-3 md:text-body-sm md:text-right max-[900px]:col-span-full max-[900px]:flex-row max-[900px]:flex-wrap max-[900px]:items-baseline max-[900px]:gap-[14px] max-[900px]:pt-0 max-[900px]:text-left">
                <span className="font-display text-[18px] md:text-[20px] text-accent tracking-[-0.3px]">
                  {event.date}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-theme-light">
                  {event.anchor}
                </span>
                <span className="font-body text-theme-muted transition-all group-hover:text-accent md:group-hover:translate-x-1">
                  {event.actionLabel}
                </span>
              </div>
            </a>
          ))}
        </div>

        <div className="border-t border-white/8 pt-8 md:pt-10 flex flex-col md:flex-row gap-3 md:gap-5">
          <Button href={primaryCtaHref} variant="primary">
            {primaryCtaLabel}
          </Button>
          <Button href={secondaryCtaHref} variant="secondary">
            {secondaryCtaLabel}
          </Button>
        </div>
      </div>
    </Section>
  );
};

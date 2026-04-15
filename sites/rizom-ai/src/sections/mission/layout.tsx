import type { JSX } from "preact";
import type { MissionContent } from "./schema";
import { Button, Divider, Section } from "@brains/rizom-ui";

export const MissionLayout = ({
  preamble,
  headlineStart,
  headlineHighlight,
  post,
  primaryCtaLabel,
  primaryCtaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
}: MissionContent): JSX.Element => {
  return (
    <Section id="mission" className="reveal py-section text-center">
      <Divider className="mb-10 md:mb-12" />
      <p className="font-body text-body-sm md:text-body-lg text-theme-light max-w-[520px] mx-auto mb-8 md:mb-10">
        {preamble}
      </p>
      <h2 className="font-display font-bold text-display-xl">
        {headlineStart}
        <br />
        <span className="inline-block relative text-accent before:content-[''] before:absolute before:left-[-8%] before:right-[-8%] before:top-1/2 before:h-px before:bg-[var(--color-highlight-underline)] before:opacity-50">
          {headlineHighlight}
        </span>
      </h2>
      <p className="font-body text-body-sm md:text-body-lg text-theme-light max-w-[500px] mx-auto mt-8">
        {post}
      </p>
      <div className="flex flex-col md:flex-row gap-3 md:gap-5 md:justify-center items-stretch md:items-center mt-9 md:mt-16">
        <Button href={primaryCtaHref} variant="primary-strong" size="lg" block>
          {primaryCtaLabel}
        </Button>
        <Button href={secondaryCtaHref} variant="secondary" size="lg" block>
          {secondaryCtaLabel}
        </Button>
      </div>
    </Section>
  );
};

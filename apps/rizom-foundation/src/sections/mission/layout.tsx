import type { JSX } from "preact";
import { Button, Divider, Section } from "@rizom/ui";

interface MissionContent {
  preamble: string;
  headlineStart: string;
  headlineHighlight: string;
  post: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
}

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
      <p className="font-body text-body-sm md:text-body-lg text-theme-light max-w-[620px] mx-auto mb-8 md:mb-10">
        {preamble}
      </p>
      <h2 className="font-display font-normal text-display-lg md:text-display-xl">
        {headlineStart}{" "}
        <span className="italic text-accent">{headlineHighlight}</span>
      </h2>
      <p className="font-body text-body-sm md:text-body-lg text-theme-light max-w-[560px] mx-auto mt-8">
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

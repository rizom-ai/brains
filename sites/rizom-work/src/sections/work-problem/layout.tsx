import type { JSX } from "preact";
import type { WorkProblemContent } from "./schema";
import { Section } from "@brains/rizom-ui";

export const WorkProblemLayout = ({
  kicker,
  headlineStart,
  headlineEmphasis,
  headlineEnd,
  subhead,
}: WorkProblemContent): JSX.Element => {
  return (
    <Section id="problem" className="reveal py-section text-center">
      <div className="inline-flex items-center gap-3 font-label text-label-sm font-semibold uppercase tracking-[0.18em] text-accent mb-6">
        <span>{kicker}</span>
      </div>
      <h2 className="font-display text-[34px] tracking-[-1.2px] leading-[1.06] md:text-display-lg max-w-[18ch] mx-auto">
        {headlineStart}{" "}
        <span className="italic text-accent">{headlineEmphasis}</span>
        {headlineEnd}
      </h2>
      <p className="mt-6 text-body-md md:text-body-xl text-theme-muted max-w-[760px] mx-auto">
        {subhead}
      </p>
    </Section>
  );
};

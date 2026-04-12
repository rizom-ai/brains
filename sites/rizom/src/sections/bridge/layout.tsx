import type { JSX } from "preact";
import type { BridgeContent } from "./schema";
import { Section } from "../../components/Section";
import { Divider } from "../../components/Divider";

export const BridgeLayout = ({
  kicker,
  body,
  linkLabel,
  linkHref,
}: BridgeContent): JSX.Element => {
  return (
    <Section id="bridge" className="reveal py-section text-center">
      <Divider className="mb-8 md:mb-10" />
      <span className="inline-flex items-center gap-3 font-label text-label-sm font-semibold uppercase tracking-[0.18em] text-accent mb-4">
        {kicker}
      </span>
      <p className="max-w-[760px] mx-auto text-body-sm md:text-body-md text-theme-muted">
        {body}
      </p>
      <a
        href={linkHref}
        className="inline-flex mt-6 md:mt-7 font-body text-body-sm md:text-body-md text-theme hover:text-accent transition-colors"
      >
        {linkLabel}
      </a>
    </Section>
  );
};
